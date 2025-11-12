// supabase/functions/import_recipe/index.ts
// ------------------------------------------------------
// Edge Function : import_recipe
//
// Entrée JSON : { url: string, household_id?: string }
//
// Sortie (succès):
//   { ok: true, recipe: { ... }, ingredients: [ ... ] }
//
// Sortie (erreur logique):
//   { ok: false, error: string }
//
// HTTP: toujours 200 (hors OPTIONS / mauvaise méthode)
// ------------------------------------------------------

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request): Promise<Response> => {
  // Préflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({
      ok: false,
      error: "Méthode non supportée (POST attendu).",
    });
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | { url?: string; household_id?: string }
      | null;

    const url = body?.url?.trim();
    if (!url) {
      return json({ ok: false, error: "Paramètre 'url' manquant." });
    }

    // 1. Récupération HTML
    const htmlRes = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MealPlannerBot/1.0; +https://example.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!htmlRes.ok) {
      return json({
        ok: false,
        error: `Impossible de charger la page (${htmlRes.status}).`,
      });
    }

    const html = await htmlRes.text();

    // 2. JSON-LD Recipe si dispo
    const recipeLd = extractRecipeJsonLd(html);

    let recipe: any;
    let ingredients: ReturnType<typeof parseIngredientLine>[];

    if (recipeLd) {
      console.log("[import_recipe] JSON-LD Recipe détecté");
      recipe = mapRecipeFromJsonLd(recipeLd, url);
      ingredients = mapIngredientsFromJsonLd(recipeLd);
    } else {
      // 3. Fallback HTML texte (avec cas Marmiton)
      console.log(
        "[import_recipe] Aucun JSON-LD Recipe, tentative d'analyse HTML..."
      );

      const fallback = extractRecipeFromHtml(html, url);
      if (!fallback) {
        console.log(
          "[import_recipe] Analyse HTML non concluante : aucun ingrédient / aucune étape trouvée"
        );
        return json({
          ok: false,
          error:
            "Aucune donnée de recette structurée trouvée sur cette page (JSON-LD Recipe manquant et analyse HTML non concluante).",
        });
      }

      recipe = fallback.recipe;
      ingredients = fallback.ingredients;

      console.log("[import_recipe] Fallback HTML OK", {
        name: recipe.name,
        ingredients_count: ingredients.length,
        has_description: !!recipe.description,
      });
    }

    return json({ ok: true, recipe, ingredients });
  } catch (err: any) {
    console.error("import_recipe error", err);
    return json({
      ok: false,
      error:
        err?.message ||
        "Erreur interne lors de l'analyse de la recette.",
    });
  }
});

// ------------------------------------------------------
// Helper réponse JSON + CORS
// ------------------------------------------------------

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

// ------------------------------------------------------
// Extraction JSON-LD Recipe
// ------------------------------------------------------

function extractRecipeJsonLd(html: string): any | null {
  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;

    try {
      const json = JSON.parse(raw);
      const candidates: any[] = [];

      if (Array.isArray(json)) {
        candidates.push(...json);
      } else if (json["@graph"] && Array.isArray(json["@graph"])) {
        candidates.push(...json["@graph"]);
      } else {
        candidates.push(json);
      }

      for (const c of candidates) {
        const type = c["@type"];
        if (!type) continue;

        if (
          (typeof type === "string" &&
            type.toLowerCase() === "recipe") ||
          (Array.isArray(type) &&
            type.some(
              (t) => String(t).toLowerCase() === "recipe"
            ))
        ) {
          return c;
        }
      }
    } catch {
      // JSON-LD invalide : on ignore
    }
  }

  return null;
}

// ------------------------------------------------------
// Mapping recette depuis JSON-LD
// ------------------------------------------------------

function mapRecipeFromJsonLd(ld: any, url: string) {
  const name =
    (ld.name ||
      ld.headline ||
      extractTitleFromUrl(url) ||
      "Recette importée").toString();

  const description =
    ld.description ||
    (Array.isArray(ld.recipeInstructions)
      ? ld.recipeInstructions
          .map((s: any) =>
            typeof s === "string" ? s : s?.text || ""
          )
          .join("\n")
      : typeof ld.recipeInstructions === "string"
      ? ld.recipeInstructions
      : null);

  const servings = parseNumber(ld.recipeYield ?? ld.yield) ?? null;

  const prep_time_min = parseIsoDurationToMinutes(ld.prepTime);
  const cook_time_min = parseIsoDurationToMinutes(ld.cookTime);
  const total_time_min =
    parseIsoDurationToMinutes(ld.totalTime) ??
    (prep_time_min != null && cook_time_min != null
      ? prep_time_min + cook_time_min
      : null);

  return {
    name,
    description: description || null,
    servings,
    prep_time_min,
    cook_time_min,
    total_time_min,
    difficulty: null,
    caloric_label: null,
    origin_code: null,
    regime_code: null,
    web_url: url,
    video_url: extractVideoUrl(ld) || null,
  };
}

// ------------------------------------------------------
// Mapping ingrédients depuis JSON-LD
// ------------------------------------------------------

function mapIngredientsFromJsonLd(ld: any) {
  const list: string[] = [];

  if (Array.isArray(ld.recipeIngredient)) {
    list.push(
      ...ld.recipeIngredient.map((x: any) =>
        typeof x === "string" ? x : String(x || "")
      )
    );
  }

  if (Array.isArray(ld.ingredients)) {
    list.push(
      ...ld.ingredients.map((x: any) =>
        typeof x === "string" ? x : String(x || "")
      )
    );
  }

  const cleaned = list.map((l) => l.trim()).filter(Boolean);
  return cleaned.map(parseIngredientLine);
}

// ------------------------------------------------------
// Utilitaires parsing génériques
// ------------------------------------------------------

function parseIsoDurationToMinutes(value: any): number | null {
  if (!value || typeof value !== "string") return null;
  const m =
    value.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;

  const days = m[1] ? Number(m[1]) : 0;
  const hours = m[2] ? Number(m[2]) : 0;
  const mins = m[3] ? Number(m[3]) : 0;

  const total = days * 24 * 60 + hours * 60 + mins;
  return Number.isNaN(total) ? null : total || null;
}

function parseNumber(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") {
    return Number.isNaN(v) ? null : v;
  }
  const s = String(v).replace(",", ".").match(/[\d.]+/);
  if (!s) return null;
  const n = Number(s[0]);
  return Number.isNaN(n) ? null : n;
}

function extractTitleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const slug = u.pathname.split("/").filter(Boolean).pop();
    if (!slug) return null;
    return decodeURIComponent(
      slug.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ")
    );
  } catch {
    return null;
  }
}

function extractVideoUrl(ld: any): string | null {
  if (!ld) return null;
  if (typeof ld.video === "string") return ld.video;
  if (ld.video && typeof ld.video.url === "string") {
    return ld.video.url;
  }
  if (Array.isArray(ld.video) && ld.video[0]?.url) {
    return String(ld.video[0].url);
  }
  return null;
}

// Parsing d'une ligne ingrédient simple
function parseIngredientLine(line: string) {
  const raw = line.trim();
  const re =
    /^\s*(\d+(?:[.,]\d+)?)?\s*([A-Za-zÀ-ÿ\.]+)?\s*(.*)$/;
  const m = raw.match(re);

  let quantity: number | null = null;
  let unit: string | null = null;
  let name = raw;

  if (m) {
    if (m[1]) quantity = parseNumber(m[1]);
    if (m[2]) unit = m[2].toLowerCase();
    if (m[3]) {
      name = m[3]
        .replace(/^de\s+/i, "")
        .replace(/^d['’]\s*/i, "")
        .trim();
    }
  }

  if (unit) {
    unit = unit.replace(/\.$/, "");
  }

  return {
    raw,
    name,
    quantity,
    unit,
    category: "principal" as const,
  };
}

// ------------------------------------------------------
// Fallback HTML (string-based, avec cas Marmiton)
// ------------------------------------------------------

function extractRecipeFromHtml(
  html: string,
  url: string
): {
  recipe: {
    name: string;
    description: string | null;
    servings: number | null;
    prep_time_min: number | null;
    cook_time_min: number | null;
    total_time_min: number | null;
    difficulty: string | null;
    caloric_label: string | null;
    origin_code: string | null;
    regime_code: string | null;
    web_url: string | null;
    video_url: string | null;
  };
  ingredients: ReturnType<typeof parseIngredientLine>[];
} | null {
  // ----- Nom -----
  const h1Match = html.match(
    /<h1[^>]*>([\s\S]*?)<\/h1>/i
  );
  const ogTitleMatch = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i
  );
  const titleMatch = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  let name =
    (h1Match && stripTags(h1Match[1])) ||
    (ogTitleMatch && ogTitleMatch[1]) ||
    (titleMatch && stripTags(titleMatch[1])) ||
    "";

  name = name
    .replace(/\s*\|\s*Marmiton.*/i, "")
    .trim();

  if (!name) {
    name =
      extractTitleFromUrl(url) || "Recette importée";
  }

  const ingredients: ReturnType<typeof parseIngredientLine>[] = [];

  // ----- Cas Marmiton explicite : bloc entre "Ingrédients" et "Ustensiles" -----
  const marmitonIngMatch = /Ingrédients([\s\S]*?)Ustensiles/i.exec(
    html
  );
  if (marmitonIngMatch) {
    const lines = extractLines(marmitonIngMatch[1]);
    for (const line of lines) {
      if (
        /ingr[ée]dients?/i.test(line) ||
        /ustensiles/i.test(line) ||
        /voir plus/i.test(line) ||
        /vous pouvez/i.test(line) ||
        /amazon/i.test(line)
      ) {
        continue;
      }
      if (
        line.length >= 2 &&
        line.length <= 200 &&
        (/\d/.test(line) ||
          /bouillon|tomate|ail|herbe|sel|poivre|huile|oignon|sucre|farine|beurre|lait|fromage|boîte|gousse/i.test(
            line
          ))
      ) {
        ingredients.push(parseIngredientLine(line));
      }
    }
  }

  // ----- Fallback générique "Ingrédients" -> stop mots-clés -----
  if (!ingredients.length) {
    const ingTitleRegex = /ingr[ée]dients?/i;
    const ingTitleMatch = ingTitleRegex.exec(html);

    if (ingTitleMatch) {
      const start =
        ingTitleMatch.index + ingTitleMatch[0].length;
      const after = html.slice(start);

      const stopRegex =
        /(Préparation|Ustensiles|Commentaires|Vous aimerez aussi|Plus de recettes|<h2|<h3)/i;
      const stopMatch = stopRegex.exec(after);
      const end =
        stopMatch != null
          ? start + stopMatch.index
          : start + 4000;

      const block = html.slice(start, end);
      const candLines = extractLines(block);

      for (const line of candLines) {
        if (
          /ingr[ée]dients?/i.test(line) ||
          /ustensiles/i.test(line) ||
          /voir plus/i.test(line) ||
          /vous pouvez/i.test(line) ||
          /amazon/i.test(line)
        ) {
          continue;
        }

        if (
          line.length >= 2 &&
          line.length <= 200 &&
          (/\d/.test(line) ||
            /bouillon|tomate|ail|herbe|sel|poivre|huile|oignon|sucre|farine|beurre|lait|fromage/i.test(
              line
            ))
        ) {
          ingredients.push(parseIngredientLine(line));
        }
      }
    }
  }

  // ----- Préparation / description -----
  let description: string | null = null;

  const prepRegex = /Préparation/i;
  const prepMatch = prepRegex.exec(html);

  if (prepMatch) {
    const start =
      prepMatch.index + prepMatch[0].length;
    const after = html.slice(start);

    const stopRegex =
      /(Commentaires|Vous aimerez aussi|Plus de recettes|Ces contenus devraient vous intéresser)/i;
    const stopMatch = stopRegex.exec(after);
    const end =
      stopMatch != null
        ? start + stopMatch.index
        : start + 8000;

    const block = html.slice(start, end);
    const lines = extractLines(block).filter(
      (l) => l.length > 3
    );

    if (lines.length) {
      description = lines.join("\n").trim();
    }
  }

  // Si rien du tout
  if (!ingredients.length && !description) {
    return null;
  }

  const recipe = {
    name,
    description,
    servings: null,
    prep_time_min: null,
    cook_time_min: null,
    total_time_min: null,
    difficulty: null,
    caloric_label: null,
    origin_code: null,
    regime_code: null,
    web_url: url,
    video_url: extractVideoUrlFromHtml(html),
  };

  return { recipe, ingredients };
}

// ------------------------------------------------------
// Helpers texte HTML
// ------------------------------------------------------

function extractLines(block: string): string[] {
  let txt = block;

  txt = txt.replace(
    /<script[\s\S]*?<\/script>/gi,
    " "
  );
  txt = txt.replace(
    /<style[\s\S]*?<\/style>/gi,
    " "
  );

  txt = txt.replace(
    /<(br|li|p|div|span|tr|td|th)[^>]*>/gi,
    "\n"
  );

  txt = txt.replace(/<[^>]+>/g, " ");

  txt = txt
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  txt = txt.replace(/\r/g, "\n");
  txt = txt.replace(/\n{2,}/g, "\n");
  txt = txt.replace(/[ \t]+/g, " ");

  return txt
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function extractVideoUrlFromHtml(html: string): string | null {
  const ogMatch = html.match(
    /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["'][^>]*>/i
  );
  if (ogMatch) return ogMatch[1];

  const iframeMatch = html.match(
    /<iframe[^>]+src=["']([^"']*(youtube|vimeo)[^"']*)["'][^>]*>/i
  );
  if (iframeMatch) return iframeMatch[1];

  return null;
}
