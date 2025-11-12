// src/functions/importRecipeFromWeb.ts
// ------------------------------------------------------
// Import d'une recette depuis une URL via l'Edge Function "import_recipe".
//
// CONTRAT ATTENDU de import_recipe (à mettre à jour côté Edge) :
//
//  Succès :
//  {
//    ok: true,
//    // optionnel: si l'Edge a détecté un doublon existant
//    duplicate?: boolean,
//    // optionnel: si l'Edge souhaite suggérer un id existant
//    recipe_id?: string,
//    recipe: {
//      name: string;
//      description?: string;
//      servings?: number;
//      prep_time_min?: number;
//      cook_time_min?: number;
//      total_time_min?: number;
//      difficulty?: string;
//      caloric_label?: string;
//      origin_code?: string | null;
//      regime_code?: string | null;
//      web_url?: string;
//      video_url?: string | null;
//    },
//    ingredients: Array<{
//      raw?: string;
//      name?: string;
//      quantity?: number | string;
//      unit?: string;
//      category?: "principal" | "epice" | "optionnel" | string;
//    }>
//  }
//
//  Échec :
//  { ok: false, error: "message" }
//
// Le FRONT crée / met à jour la recette + les ingrédients.
// Si la fonction renvoie UNIQUEMENT { ok:true, recipe_id }, on considère
// que le backend n'est pas encore adapté et on renvoie une erreur claire.
// ------------------------------------------------------

import { supabase } from "../lib/supabaseClient";

export type IngredientCatalog = {
  id: number;
  product_name: string;
  standard_unit_code: string;
  secondary_unit_code: string | null;
  secondary_to_standard_factor: number | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  is_active?: boolean;
};

export type Unit = {
  code: string;
  label: string;
};

export type ImportRecipeFromWebOptions = {
  url: string;
  householdId: string;
  ingredientCatalog: IngredientCatalog[];
  units: Unit[];
};

export type ImportRecipeFromWebResult = {
  recipeId: string;
  duplicate: boolean;
};

type RawIngredient = {
  raw?: string;
  name?: string;
  quantity?: number | string;
  unit?: string;
  category?: "principal" | "epice" | "optionnel" | string;
};

type RawRecipe = {
  name?: string;
  title?: string;
  description?: string;
  instructions?: string;
  servings?: number | string;
  yield?: number | string;
  prep_time_min?: number | string;
  cook_time_min?: number | string;
  total_time_min?: number | string;
  total_time?: number | string;
  difficulty?: string;
  caloric_label?: string;
  origin_code?: string | null;
  regime_code?: string | null;
  web_url?: string;
  url?: string;
  video_url?: string | null;
  ingredients?: RawIngredient[];
};

type ImportRecipeEdgeResponse = {
  ok?: boolean;
  duplicate?: boolean;
  recipe_id?: string;
  recipe?: RawRecipe;
  ingredients?: RawIngredient[];
  error?: string;
};

export async function importRecipeFromWeb(
  options: ImportRecipeFromWebOptions
): Promise<ImportRecipeFromWebResult> {
  const { url, householdId, ingredientCatalog, units } = options;

  console.log("[importRecipeFromWeb] invoke import_recipe", {
    url,
    householdId,
  });

  const { data, error } =
    await supabase.functions.invoke<ImportRecipeEdgeResponse>(
      "import_recipe",
      {
        body: {
          url,
          household_id: householdId,
        },
      }
    );

  console.log("[importRecipeFromWeb] raw response", { data, error });

  if (error) {
    throw new Error("Erreur Edge Function import_recipe: " + error.message);
  }

  if (!data) {
    throw new Error("Aucune réponse de la fonction import_recipe.");
  }

  if (data.ok === false) {
    throw new Error(data.error || "Import impossible pour cette URL.");
  }

  const rawRecipe: RawRecipe | undefined = data.recipe;
  const rawIngredients: RawIngredient[] =
    (Array.isArray(data.ingredients) && data.ingredients) ||
    (rawRecipe?.ingredients && Array.isArray(rawRecipe.ingredients)
      ? rawRecipe.ingredients
      : []);

  // ⚠ Cas actuel chez toi : ok + recipe_id SEUL → on refuse
  if (!rawRecipe && rawIngredients.length === 0) {
    if (data.recipe_id) {
      console.error(
        "[importRecipeFromWeb] Edge renvoie seulement { ok, recipe_id }." +
          " Le front ne reçoit aucune donnée (titre, ingrédients...)."
      );
      throw new Error(
        "La fonction 'import_recipe' renvoie seulement un identifiant " +
          "sans les données détaillées de la recette. " +
          "Le module front est prêt à consommer {recipe, ingredients} " +
          "mais il faut mettre à jour l'Edge Function en conséquence."
      );
    }

    throw new Error(
      "Réponse de 'import_recipe' incomplète : aucun détail de recette reçu."
    );
  }

  // ------------------------------------------------------
  // Normalisation des champs recette
  // ------------------------------------------------------
  const name =
    (rawRecipe?.name ||
      rawRecipe?.title ||
      extractTitleFromUrl(url) ||
      "Recette importée"
    )
      .toString()
      .trim();

  const description =
    rawRecipe?.description ||
    rawRecipe?.instructions ||
    null;

  const servings = parseOptionalNumber(
    rawRecipe?.servings ?? rawRecipe?.yield
  );
  const prep = parseOptionalNumber(rawRecipe?.prep_time_min);
  const cook = parseOptionalNumber(rawRecipe?.cook_time_min);
  const totalFromRaw =
    parseOptionalNumber(rawRecipe?.total_time_min) ||
    parseOptionalNumber(rawRecipe?.total_time);

  const total =
    totalFromRaw ??
    (prep != null && cook != null ? prep + cook : null);

  const recipePayload: any = {
    household_id: householdId,
    name,
    description,
    servings,
    prep_time_min: prep,
    cook_time_min: cook,
    total_time_min: total,
    difficulty: rawRecipe?.difficulty || null,
    caloric_label: rawRecipe?.caloric_label || null,
    origin_code: rawRecipe?.origin_code || null,
    regime_code: rawRecipe?.regime_code || null,
    web_url:
      rawRecipe?.web_url || rawRecipe?.url || url,
    video_url: rawRecipe?.video_url || null,
  };

  // Si l'Edge a proposé un recipe_id (ex: duplication), on l'utilise pour update
  let recipeId = data.recipe_id || null;

  if (recipeId) {
    console.log(
      "[importRecipeFromWeb] Update recette existante",
      recipeId
    );

    const { error: updateError } = await supabase
      .from("recipes")
      .update(recipePayload)
      .eq("id", recipeId);

    if (updateError) {
      console.error(
        "[importRecipeFromWeb] update recette existante KO",
        updateError
      );
      throw new Error(
        "Impossible de mettre à jour la recette existante avec les données importées."
      );
    }
  } else {
    console.log(
      "[importRecipeFromWeb] Insert nouvelle recette",
      recipePayload
    );
    const { data: inserted, error: insertError } = await supabase
      .from("recipes")
      .insert(recipePayload)
      .select()
      .single();

    if (insertError || !inserted) {
      console.error(
        "[importRecipeFromWeb] insert recette KO",
        insertError
      );
      throw new Error(
        "Impossible d'enregistrer la recette importée en base."
      );
    }

    recipeId = inserted.id as string;
  }

  // ------------------------------------------------------
  // Ingrédients
  // ------------------------------------------------------
  if (recipeId && rawIngredients.length > 0) {
    // On supprime d'abord les lignes existantes pour cette recette
    await supabase
      .from("recipe_ingredients")
      .delete()
      .eq("recipe_id", recipeId);

    const rows = rawIngredients
      .map((ing) => {
        const baseName = (
          ing.name ||
          ing.raw ||
          ""
        )
          .toString()
          .trim();
        if (!baseName) return null;

        const catalogMatch = findBestCatalogMatch(
          baseName,
          ingredientCatalog
        );

        const quantity = parseOptionalNumber(ing.quantity);
        const unitCode = resolveUnitCode(ing.unit, units);

        const catRaw = (ing.category || "")
          .toString()
          .toLowerCase();

        const category: "principal" | "epice" | "optionnel" =
          catRaw === "epice" || catRaw === "épice"
            ? "epice"
            : catRaw === "optionnel"
            ? "optionnel"
            : "principal";

        return {
          recipe_id: recipeId,
          ingredient_catalog_id: catalogMatch
            ? catalogMatch.id
            : null,
          ingredient_name:
            catalogMatch?.product_name || baseName,
          ingredient_category: category,
          quantity,
          unit_code: unitCode,
        };
      })
      .filter(
        (row): row is NonNullable<typeof row> =>
          !!row && !!row.ingredient_name
      );

    if (rows.length > 0) {
      console.log(
        "[importRecipeFromWeb] insert ingredients",
        rows
      );
      const { error: ingError } = await supabase
        .from("recipe_ingredients")
        .insert(rows);

      if (ingError) {
        console.error(
          "[importRecipeFromWeb] insert ingredients KO",
          ingError
        );
        // On laisse la recette même si les ingrédients ont raté.
      }
    } else {
      console.log(
        "[importRecipeFromWeb] aucun ingrédient exploitable"
      );
    }
  }

  if (!recipeId) {
    throw new Error(
      "Import terminé mais aucun id de recette obtenu."
    );
  }

  return {
    recipeId,
    duplicate: !!data.duplicate,
  };
}

// ------------------------------------------------------
// Helpers
// ------------------------------------------------------

function parseOptionalNumber(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isNaN(value) ? null : value;
  }
  const cleaned = value.toString().trim().replace(",", ".");
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function extractTitleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const slug = u.pathname.split("/").filter(Boolean).pop();
    if (!slug) return null;
    return decodeURIComponent(
      slug
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[-_]+/g, " ")
    );
  } catch {
    return null;
  }
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Matching simple avec le catalogue
function findBestCatalogMatch(
  name: string,
  catalog: IngredientCatalog[]
): IngredientCatalog | undefined {
  const n = normalize(name);
  if (!n) return undefined;

  let best =
    catalog.find((c) => normalize(c.product_name) === n) ||
    undefined;
  if (best) return best;

  best =
    catalog.find((c) => n.includes(normalize(c.product_name))) ||
    undefined;
  if (best) return best;

  best =
    catalog.find((c) => normalize(c.product_name).includes(n)) ||
    undefined;

  return best;
}

// Résolution d'unité
function resolveUnitCode(
  rawUnit: string | undefined | null,
  units: Unit[]
): string | null {
  if (!rawUnit) return null;

  const u = normalize(rawUnit);
  if (!u) return null;

  const direct = units.find(
    (unit) => normalize(unit.code) === u
  );
  if (direct) return direct.code;

  const byLabel = units.find(
    (unit) => normalize(unit.label) === u
  );
  if (byLabel) return byLabel.code;

  const aliasMap: Record<string, string[]> = {
    g: ["g", "gramme", "grammes", "gram", "grams"],
    kg: ["kg", "kilogramme", "kilogrammes"],
    ml: ["ml", "millilitre", "millilitres"],
    l: ["l", "litre", "litres"],
    c_a_c: [
      "cac",
      "c a c",
      "cuil a c",
      "cuil a cafe",
      "teaspoon",
    ],
    c_a_s: [
      "cas",
      "c a s",
      "cuil a s",
      "cuil a soupe",
      "tablespoon",
    ],
    piece: [
      "piece",
      "pieces",
      "p",
      "unite",
      "unites",
      "pc",
      "pcs",
    ],
  };

  for (const [code, aliases] of Object.entries(aliasMap)) {
    if (aliases.includes(u)) {
      const exists = units.find(
        (unit) =>
          normalize(unit.code) === normalize(code)
      );
      if (exists) return exists.code;
    }
  }

  return null;
}