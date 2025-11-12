import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }});
  if (req.method !== "POST") return new Response("Bad method", { status: 405 });

  const { rows } = await req.json(); // [{product_name, standard_unit_code, kcal_100g, protein_100g, carbs_100g, fat_100g}]
  if (!Array.isArray(rows)) return new Response("rows must be array", { status: 400 });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // <— service role
  );

  const { data, error } = await supa
    .from("ingredient_catalog")
    .insert(rows)
    .select();

  if (error) return new Response(JSON.stringify({ ok:false, error }), { status: 500, headers:{ "Content-Type":"application/json","Access-Control-Allow-Origin": "*" }});
  return new Response(JSON.stringify({ ok:true, data }), { status: 200, headers:{ "Content-Type":"application/json","Access-Control-Allow-Origin": "*" }});
});
