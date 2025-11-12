// supabase/functions/ai_import_recipe/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ImportRequest {
  url?: string;
  html?: string;
  text?: string;
}

interface Ingredient {
  raw: string;
  amount?: number | null;
  unit?: string | null;
  ingredient?: string | null;
}

interface RecipeResult {
  title: string;
  description?: string;
  web_url?: string;
  video_url?: string;
  servings?: number | null;
  prep_time_min?: number | null;
  cook_time_min?: number | null;
  total_time_min?: number | null;
  ingredients: Ingredient[];
  steps: string[];
}

// ------------ Utils ------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

function sanitizeHtmlToText(html: string, maxLen = 20000): string {
  let txt = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  txt = txt.replace(/\s+/g, " ").trim();
  if (txt.length > maxLen) txt = txt.slice(0, maxLen);
  return txt;
}

function tryParseJsonLdRecipe(html: string, sourceUrl?: string): RecipeResult | null {
  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;

    try {
      const data = JSON.parse(raw);
      const candidates = Array.isArray(data) ? data : [data];

      for (const item of candidates) {
        const type = item["@type"] || item["type"];
        const types = Array.isArray(type) ? type : [type];

        if (types && types.includes("Recipe")) {
          const ing = item.recipeIngredient || item.ingredients || [];
          const instructions = item.recipeInstructions || [];

          const steps: string[] = Array.isArray(instructions)
            ? instructions
              .map((i: any) =>
                typeof i === "string"
                  ? i
                  : (i.text || i.name || "").toString(),
              )
              .filter((s: string) => s && s.trim().length > 0)
            : typeof instructions === "string"
            ? [instructions]
            : [];

          const ingredients: Ingredient[] = (Array.isArray(ing) ? ing : [ing])
            .filter((s: any) => !!s)
            .map((s: any) => ({
              raw: s.toString(),
            }));

          const toMinutes = (val: any): number | null => {
            if (!val || typeof val !== "string") return null;
            const iso = /PT(?:(\d+)H)?(?:(\d+)M)?/i.exec(val);
            if (iso) {
              const h = iso[1] ? parseInt(iso[1]) : 0;
              const m = iso[2] ? parseInt(iso[2]) : 0;
              return h * 60 + m;
            }
            const num = parseInt(val.replace(/[^\d]/g, ""));
            return isNaN(num) ? null : num;
          };

          const prep = toMinutes(item.prepTime);
          const cook = toMinutes(item.cookTime);
          const total =
            toMinutes(item.totalTime) ??
            (prep != null && cook != null ? prep + cook : null);

          return {
            title: item.name || "Recette sans titre",
            description: item.description || "",
            web_url: sourceUrl,
            video_url:
              item.video?.url ??
              item.video_url ??
              (typeof item.video === "string" ? item.video : undefined),
            servings:
              typeof item.recipeYield === "number"
                ? item.recipeYield
                : Array.isArray(item.recipeYield)
                ? parseInt(item.recipeYield[0])
                : typeof item.recipeYield === "string"
                ? parseInt(item.recipeYield)
                : null,
            prep_time_min: prep ?? null,
            cook_time_min: cook ?? null,
            total_time_min: total ?? null,
            ingredients,
            steps,
          };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function callDeepSeek(
  apiKey: string,
  model: string,
  sourceText: string,
  sourceUrl?: string,
): Promise<RecipeResult> {
  const prompt = `
Tu es un assistant culinaire expert.

À partir du contenu suivant d'une page de recette, produis STRICTEMENT un JSON valide respectant ce schéma :

{
  "title": "Nom de la recette",
  "description": "Texte court",
  "web_url": "${sourceUrl ?? ""}",
  "video_url": "URL vidéo si présente ou chaîne vide",
  "servings": nombre ou null,
  "prep_time_min": nombre ou null,
  "cook_time_min": nombre ou null,
  "total_time_min": nombre ou null,
  "ingredients": [
    {
      "raw": "Texte original de la ligne ingrédient",
      "amount": nombre ou null,
      "unit": "unité texte ou null",
      "ingredient": "nom de l'ingrédient principal ou null"
    }
  ],
  "steps": [
    "Étape 1",
    "Étape 2"
  ]
}

Contraintes :
- Réponds en français si la recette est en français.
- Ne crée PAS d'autres champs.
- Pas de texte avant/après, uniquement le JSON.
- Si une info manque, mets null ou "" sans inventer.

Contenu de la page :
"""${sourceText}"""
`.trim();

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
    }),
  });

  const bodyText = await res.text();

  if (!res.ok) {
    console.error("DeepSeek error:", res.status, bodyText);
    throw new Error(
      `DeepSeek HTTP ${res.status}: ${bodyText.slice(0, 400)}`,
    );
  }

  let data: any;
  try {
    data = JSON.parse(bodyText);
  } catch {
    console.error("DeepSeek non-JSON:", bodyText);
    throw new Error("Réponse DeepSeek illisible (JSON invalide).");
  }

  const content =
    data.choices?.[0]?.message?.content?.toString() ?? "";

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    console.error("DeepSeek content:", content);
    throw new Error(
      "DeepSeek n'a pas renvoyé un JSON isolé comme demandé.",
    );
  }

  const jsonSlice = content.slice(start, end + 1);

  let recipe: RecipeResult;
  try {
    recipe = JSON.parse(jsonSlice);
  } catch (e) {
    console.error("Erreur parse JSON DeepSeek:", e, jsonSlice);
    throw new Error(
      "Impossible d'interpréter le JSON retourné par DeepSeek.",
    );
  }

  if (!recipe.title || !Array.isArray(recipe.ingredients) ||
    !Array.isArray(recipe.steps)
  ) {
    throw new Error("Champs essentiels manquants dans la recette IA.");
  }

  return recipe;
}

// ------------ Handler ------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, error: "Méthode non autorisée, utiliser POST." },
      405,
    );
  }

  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  const DEEPSEEK_MODEL = Deno.env.get("DEEPSEEK_MODEL") || "deepseek-chat";

  if (!DEEPSEEK_API_KEY) {
    console.error("DEEPSEEK_API_KEY manquant");
    return jsonResponse(
      {
        ok: false,
        error:
          "DEEPSEEK_API_KEY non configurée dans Edge Function Secrets.",
      },
      500,
    );
  }

  let payload: ImportRequest;
  try {
    payload = (await req.json()) as ImportRequest;
  } catch {
    return jsonResponse({ ok: false, error: "Corps JSON invalide." }, 400);
  }

  const { url, html, text } = payload || {};
  if (!url && !html && !text) {
    return jsonResponse(
      {
        ok: false,
        error: "Envoyez au moins 'url', 'html' ou 'text'.",
      },
      400,
    );
  }

  const warnings: string[] = [];
  let sourceHtml = html || "";
  const sourceUrl = url;

  // 1) Récupération HTML si URL fournie
  if (!sourceHtml && url) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) {
        warnings.push(
          `Échec du chargement de l'URL (${res.status}). Utilisation éventuelle du texte fourni.`,
        );
      } else {
        sourceHtml = await res.text();
      }
    } catch (err) {
      console.error("Erreur fetch URL:", err);
      warnings.push(
        "Impossible de charger l'URL côté Edge Function.",
      );
    }
  }

  // 2) JSON-LD si dispo
  if (sourceHtml) {
    const jsonLdRecipe = tryParseJsonLdRecipe(sourceHtml, sourceUrl || url);
    if (jsonLdRecipe) {
      return jsonResponse({
        ok: true,
        from: "json-ld",
        data: jsonLdRecipe,
        warnings,
      });
    }
  }

  // 3) Sinon texte nettoyé ou fourni
  const sourceText =
    (sourceHtml && sanitizeHtmlToText(sourceHtml)) ||
    text ||
    "";

  if (!sourceText) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Aucun contenu exploitable trouvé (HTML ou texte vide après nettoyage).",
        warnings,
      },
      400,
    );
  }

  try {
    const recipe = await callDeepSeek(
      DEEPSEEK_API_KEY,
      DEEPSEEK_MODEL,
      sourceText,
      sourceUrl || url,
    );

    return jsonResponse({
      ok: true,
      from: "deepseek",
      data: recipe,
      warnings,
    });
  } catch (err: any) {
    console.error("[ai_import_recipe] Unexpected:", err);
    return jsonResponse(
      {
        ok: false,
        error: err?.message || "Erreur IA lors de l'analyse de la recette.",
        warnings,
      },
      500,
    );
  }
});
