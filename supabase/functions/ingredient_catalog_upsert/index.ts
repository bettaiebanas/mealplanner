// supabase/functions/ingredient_catalog_upsert/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.2";

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface UpsertItem {
  name: string;
  unit_code: string | null;
}

interface UpsertRequest {
  household_id: string;
  items: UpsertItem[];
}

/**
 * Edge function sécurisée pour créer/récupérer des ingrédients du catalogue.
 *
 * Entrée:
 * {
 *   "household_id": "uuid",
 *   "items": [
 *     { "name": "huile d'olive", "unit_code": "g" }
 *   ]
 * }
 *
 * Sortie:
 * {
 *   "ok": true,
 *   "items": [
 *     { "id": 123, "name": "huile d'olive", "unit_code": "g" }
 *   ]
 * }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Use POST." }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  let payload: UpsertRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON body." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  const { household_id, items } = payload || {};
  if (!household_id || !Array.isArray(items)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "household_id and items[] are required.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const results: {
    id: number;
    name: string;
    unit_code: string | null;
  }[] = [];

  for (const item of items) {
    const name = (item.name || "").trim();
    if (!name) continue;

    // 1) Chercher si déjà présent pour ce foyer (insensible à la casse)
    const { data: existing, error: selectError } = await supabaseAdmin
      .from("ingredient_catalog")
      .select("id, product_name, standard_unit_code")
      .eq("household_id", household_id)
      .ilike("product_name", name)
      .maybeSingle();

    if (selectError) {
      console.error("ingredient_catalog select error", selectError);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Error while checking ingredient_catalog.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    if (existing) {
      results.push({
        id: existing.id,
        name: existing.product_name,
        unit_code: existing.standard_unit_code,
      });
      continue;
    }

    // 2) Sinon, création
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("ingredient_catalog")
      .insert({
        household_id,
        product_name: name,
        standard_unit_code: item.unit_code,
        is_active: true,
      })
      .select("id, product_name, standard_unit_code")
      .single();

    if (insertError || !inserted) {
      console.error("ingredient_catalog insert error", insertError);
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "Unable to insert some ingredients into ingredient_catalog (check RLS).",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    results.push({
      id: inserted.id,
      name: inserted.product_name,
      unit_code: inserted.standard_unit_code,
    });
  }

  return new Response(
    JSON.stringify({ ok: true, items: results }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
});
