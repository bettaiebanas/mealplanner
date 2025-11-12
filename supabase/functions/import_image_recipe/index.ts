import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PYTHON_SERVICE_URL =
  Deno.env.get("PYTHON_RECIPE_API_URL") ?? "";
const PYTHON_SERVICE_SECRET =
  Deno.env.get("PYTHON_RECIPE_API_SECRET") ?? "";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200, // IMPORTANT: toujours 200
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

serve(async (req: Request): Promise<Response> => {
  try {
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

    if (!PYTHON_SERVICE_URL) {
      console.error("PYTHON_RECIPE_API_URL manquant");
      return json({
        ok: false,
        error:
          "Service d'analyse d'image non configuré (PYTHON_RECIPE_API_URL manquant).",
      });
    }

    const body = (await req.json().catch(() => null)) as
      | { image_url?: string; household_id?: string }
      | null;

    const image_url = body?.image_url?.trim();
    if (!image_url) {
      return json({
        ok: false,
        error:
          "Paramètre 'image_url' manquant (body JSON: { image_url: string }).",
      });
    }

    // Appel du service Python
    const upstreamRes = await fetch(
      `${PYTHON_SERVICE_URL.replace(/\/+$/, "")}/import-recipe-from-image`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(PYTHON_SERVICE_SECRET
            ? { "x-internal-secret": PYTHON_SERVICE_SECRET }
            : {}),
        },
        body: JSON.stringify({
          image_url,
          household_id: body?.household_id ?? null,
        }),
      },
    );

    const text = await upstreamRes.text().catch(() => "");
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      console.error("Python JSON invalide:", text);
    }

    if (!upstreamRes.ok || !data) {
      console.error(
        "Python service error:",
        upstreamRes.status,
        text || "<no body>",
      );
      return json({
        ok: false,
        error:
          (data && data.error) ||
          "Erreur du service d'analyse d'image.",
      });
    }

    // data est déjà du type { ok, recipe, ingredients } ou { ok:false, error }
    return json(data);
  } catch (err) {
    console.error("ai_import_recipe internal error:", err);
    return json({
      ok: false,
      error: "Erreur interne lors de l'analyse de l'image.",
    });
  }
});
