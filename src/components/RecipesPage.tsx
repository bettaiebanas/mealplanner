// src/components/RecipesPage.tsx
// Gestion des recettes pour un foyer
// Corrigé sans suppression de fonctionnalités.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import IngredientMapperModal, { type ImportedIngredient } from "./IngredientMapperModal";

/* ---------- Types ---------- */
export type Household = { id: string; name: string };

type Recipe = {
  id: string;
  household_id: string;
  name: string;

  role_id: number | null;
  origin_code: string | null;
  regime_code: string | null;

  difficulty_id: number | null;   // FK -> recipe_difficulties
  difficulty?: string | null;     // legacy (compat)

  servings: number | null;
  unitary_available: boolean | null;

  prep_time_min: number | null;
  cook_time_min: number | null;
  total_time_min: number | null;

  web_url: string | null;
  video_url: string | null;
  description: string | null;

  kcal_total: number | null;
  protein_total: number | null;
  carbs_total: number | null;
  fat_total: number | null;
};

type RecipeRole = { id: number; code: string; label: string };
type Origin = { code: string; label: string };
type Regime = { code: string; label: string };
type Difficulty = { id: number; label: string };

type IngredientCatalog = {
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

type Unit = { code: string; label: string };

type RecipeIngredient = {
  id: number;
  recipe_id: string;
  ingredient_catalog_id: number | null;
  ingredient_name: string | null;
  ingredient_category: "principal" | "epice" | "optionnel";
  quantity: number | null;
  unit_code: string | null;
};

type RecipesPageProps = { household: Household; canEdit?: boolean };

/* ---------- Composant ---------- */
const RecipesPage: React.FC<RecipesPageProps> = ({ household, canEdit = true }) => {
  // états principaux
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);

  const [roles, setRoles] = useState<RecipeRole[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [regimes, setRegimes] = useState<Regime[]>([]);
  const [difficulties, setDifficulties] = useState<Difficulty[]>([]);

  const [ingredientCatalog, setIngredientCatalog] = useState<IngredientCatalog[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);

  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // import IA (URL)
  const [showAiImportModal, setShowAiImportModal] = useState(false);
  const [aiImportUrl, setAiImportUrl] = useState("");
  const [aiImportLoading, setAiImportLoading] = useState(false);

  // import image
  const [showImageImportModal, setShowImageImportModal] = useState(false);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [imageImportLoading, setImageImportLoading] = useState(false);

  // mapping IA
  const [mapperOpen, setMapperOpen] = useState(false);
  const [mapperRecipeId, setMapperRecipeId] = useState<string | null>(null);
  const [importedForMapping, setImportedForMapping] = useState<ImportedIngredient[]>([]);

  /* ---------- Chargements ---------- */
  useEffect(() => {
    if (!household?.id) return;
    (async () => {
      setLoading(true);
      setError(null);
      setInfo(null);
      await Promise.all([
        loadRecipes(),
        loadRoles(),
        loadOrigins(),
        loadRegimes(),
        loadDifficulties(),
        loadCatalog(),
        loadUnits(),
      ]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household.id]);

  useEffect(() => {
    if (!selectedRecipeId) {
      setIngredients([]);
      return;
    }
    loadIngredients(selectedRecipeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecipeId]);

  const loadRecipes = async () => {
    const { data, error } = await supabase
      .from("recipes")
      .select("*")
      .eq("household_id", household.id)
      .order("name", { ascending: true });
    if (error) {
      console.error("loadRecipes error", error);
      setError("Impossible de charger les recettes.");
      setRecipes([]);
      return;
    }
    const list = (data as Recipe[]) || [];
    setRecipes(list);
    if (!selectedRecipeId && list.length > 0) setSelectedRecipeId(list[0].id);
  };

  const loadRoles = async () => {
    const { data, error } = await supabase.from("recipe_roles").select("id,code,label").order("id");
    if (error) console.warn("loadRoles error", error);
    setRoles(((data as RecipeRole[]) || []).filter(Boolean));
  };

  const loadOrigins = async () => {
    const { data, error } = await supabase
      .from("recipe_origins")
      .select("id,label,household_id")
      .eq("household_id", household.id)
      .order("label");
    if (error) {
      console.warn("loadOrigins error", error);
      setOrigins([]);
      return;
    }
    const mapped: Origin[] = ((data as any[]) || []).map((o) => ({ code: String(o.id), label: o.label }));
    setOrigins(mapped);
  };

  const loadRegimes = async () => {
    const { data, error } = await supabase
      .from("recipe_diets")
      .select("id,label,household_id")
      .eq("household_id", household.id)
      .order("label");
    if (error) {
      console.warn("loadRegimes error", error);
      setRegimes([]);
      return;
    }
    const mapped: Regime[] = ((data as any[]) || []).map((o) => ({ code: String(o.id), label: o.label }));
    setRegimes(mapped);
  };

  const loadDifficulties = async () => {
    const { data, error } = await supabase.from("recipe_difficulties").select("id,label").order("id");
    if (error) {
      console.warn("loadDifficulties error", error);
      setDifficulties([]);
      return;
    }
    setDifficulties((data as Difficulty[]) || []);
  };

  const loadCatalog = async () => {
    const { data, error } = await supabase
      .from("ingredient_catalog")
      .select(
        "id, product_name, standard_unit_code, secondary_unit_code, secondary_to_standard_factor, kcal_100g, protein_100g, carbs_100g, fat_100g, is_active",
      )
      .order("product_name");
    if (error) {
      console.error("loadCatalog error", error);
      setIngredientCatalog([]);
      return;
    }
    setIngredientCatalog((((data as any[]) || []).filter((c) => c.is_active !== false) || []) as IngredientCatalog[]);
  };

  const loadUnits = async () => {
    const { data, error } = await supabase.from("units").select("code,label").order("code");
    if (error) {
      console.error("loadUnits error", error);
      setUnits([]);
      return;
    }
    setUnits((data as Unit[]) || []);
  };

  const loadIngredients = async (recipeId: string) => {
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .select("id, recipe_id, ingredient_catalog_id, ingredient_name, ingredient_category, quantity, unit_code")
      .eq("recipe_id", recipeId)
      .order("id");
    if (error) {
      console.error("loadIngredients error", error);
      setIngredients([]);
      return;
    }
    setIngredients((data as RecipeIngredient[]) || []);
  };

  /* ---------- Sélection & filtre ---------- */
  const selectedRecipe: Recipe | null = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) || null,
    [recipes, selectedRecipeId],
  );

  const filteredRecipes = useMemo(() => {
    if (!search.trim()) return recipes;
    const q = search.trim().toLowerCase();
    return recipes.filter((r) => {
      const role = roles.find((ro) => ro.id === r.role_id)?.label || "";
      const origin = origins.find((o) => o.code === (r.origin_code || ""))?.label || "";
      const regime = regimes.find((rg) => rg.code === (r.regime_code || ""))?.label || "";
      const diff = difficulties.find((d) => d.id === r.difficulty_id)?.label || "";
      const haystack = [r.name, role, origin, regime, diff].join(" ").toLowerCase();
      return q.split(/\s+/).every((t) => haystack.includes(t));
    });
  }, [search, recipes, roles, origins, regimes, difficulties]);

  /* ---------- Mutations ---------- */
  const checkDuplicate = async (probe: { name?: string; web_url?: string }) => {
    if (!probe.name && !probe.web_url) return null;
    const q = supabase.from("recipes").select("id, name, web_url").eq("household_id", household.id).limit(1);
    if (probe.name) q.ilike("name", probe.name);
    if (probe.web_url) q.eq("web_url", probe.web_url);
    const { data } = await q;
    return (data && (data as any[])[0]) || null;
  };

  const handleCreateRecipe = async () => {
    if (!canEdit) return;
    const baseName = "Nouvelle recette";
    const duplicate = await checkDuplicate({ name: baseName });
    if (duplicate) {
      setInfo("Une recette 'Nouvelle recette' existe déjà. Utilisez-la ou renommez-la.");
      setSelectedRecipeId(duplicate.id);
      return;
    }
    const { data, error } = await supabase
      .from("recipes")
      .insert({ household_id: household.id, name: baseName })
      .select()
      .single();
    if (error || !data) {
      console.error("handleCreateRecipe error", error);
      setError("Impossible de créer la recette.");
      return;
    }
    await loadRecipes();
    setSelectedRecipeId((data as Recipe).id);
  };

  const handleDeleteRecipe = async (recipe: Recipe) => {
    if (!canEdit) return;
    if (!window.confirm(`Supprimer la recette "${recipe.name}" ? Cette action est définitive.`)) return;
    await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipe.id);
    const { error } = await supabase.from("recipes").delete().eq("id", recipe.id);
    if (error) {
      console.error("handleDeleteRecipe error", error);
      setError("Impossible de supprimer la recette.");
      return;
    }
    const remaining = recipes.filter((r) => r.id !== recipe.id);
    setRecipes(remaining);
    if (remaining.length > 0) setSelectedRecipeId(remaining[0].id);
    else {
      setSelectedRecipeId(null);
      setIngredients([]);
    }
  };

  const handleUpdateRecipeField = async (recipe: Recipe, patch: Partial<Recipe>) => {
    if (!canEdit) return;

    // Vérification basique de doublon sur nom/URL
    if (patch.name || patch.web_url) {
      const dup = await checkDuplicate({ name: patch.name || recipe.name, web_url: patch.web_url || recipe.web_url || undefined });
      if (dup && dup.id !== recipe.id) {
        setError("Une recette avec ce nom ou ce lien existe déjà dans ce foyer.");
        return;
      }
    }

    const { error } = await supabase.from("recipes").update(patch).eq("id", recipe.id);
    if (error) {
      console.error("handleUpdateRecipeField error", error);
      setError("Impossible d'enregistrer la recette.");
      return;
    }
    setRecipes((prev) => prev.map((r) => (r.id === recipe.id ? { ...r, ...patch } : r)));
  };

  const recomputeNutrition = async (recipeId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("compute_recipe_nutrition", { body: { recipe_id: recipeId } });
      if (error) {
        console.warn("compute_recipe_nutrition warn", error);
        return;
      }
      if (data && (data as any).patch) {
        setRecipes((prev) => prev.map((r) => (r.id === recipeId ? { ...r, ...(data.patch as Partial<Recipe>) } : r)));
      }
    } catch {
      // silencieux
    }
  };

  // CRUD ingrédients
  const handleAddIngredientRow = async () => {
    if (!canEdit || !selectedRecipe) return;
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .insert({
        recipe_id: selectedRecipe.id,
        ingredient_catalog_id: null,
        ingredient_name: "Ingrédient",
        ingredient_category: "principal",
        quantity: null,
        unit_code: null,
      })
      .select()
      .single();
    if (error || !data) {
      console.error("handleAddIngredientRow error", error);
      setError("Impossible d'ajouter un ingrédient.");
      return;
    }
    setIngredients((prev) => [...prev, data as RecipeIngredient]);
  };

  const handleUpdateIngredient = async (row: RecipeIngredient, patch: Partial<RecipeIngredient>) => {
    if (!canEdit) return;
    const newRow = { ...row, ...patch };
    // Toujours garder un ingredient_name lisible
    if (!newRow.ingredient_name || newRow.ingredient_name.trim() === "") {
      const cat = newRow.ingredient_catalog_id ? ingredientCatalog.find((c) => c.id === newRow.ingredient_catalog_id) : null;
      newRow.ingredient_name = cat?.product_name || row.ingredient_name || "Ingrédient";
    }
    const { error } = await supabase
      .from("recipe_ingredients")
      .update({
        ingredient_catalog_id: newRow.ingredient_catalog_id,
        ingredient_name: newRow.ingredient_name,
        ingredient_category: newRow.ingredient_category,
        quantity: newRow.quantity,
        unit_code: newRow.unit_code,
      })
      .eq("id", row.id);
    if (error) {
      console.error("handleUpdateIngredient error", error);
      setError("Impossible de modifier cet ingrédient.");
      return;
    }
    setIngredients((prev) => prev.map((i) => (i.id === row.id ? newRow : i)));
    if (selectedRecipe) await recomputeNutrition(selectedRecipe.id);
  };

  const handleDeleteIngredient = async (row: RecipeIngredient) => {
    if (!canEdit) return;
    const { error } = await supabase.from("recipe_ingredients").delete().eq("id", row.id);
    if (error) {
      console.error("handleDeleteIngredient error", error);
      setError("Impossible de supprimer cet ingrédient.");
      return;
    }
    setIngredients((prev) => prev.filter((i) => i.id !== row.id));
    if (selectedRecipe) await recomputeNutrition(selectedRecipe.id);
  };

  /* ---------- Import IA ---------- */
  const handleAiImport = async () => {
    if (!aiImportUrl.trim()) return;
    setAiImportLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai_import_recipe", {
        body: { url: aiImportUrl.trim(), household_id: household.id },
      });
      if (error) throw error;

      const ia = (data?.data || data) as {
        title: string;
        description?: string;
        web_url?: string;
        video_url?: string;
        servings?: number | null;
        prep_time_min?: number | null;
        cook_time_min?: number | null;
        total_time_min?: number | null;
        ingredients: ImportedIngredient[];
        steps?: string[];
      };

      // créer une recette minimaliste
      const { data: recData, error: recErr } = await supabase
        .from("recipes")
        .insert({
          household_id: household.id,
          name: ia.title || "Recette importée",
          description: ia.steps?.join("\n") || ia.description || null,
          web_url: ia.web_url || aiImportUrl.trim(),
          video_url: ia.video_url || null,
          servings: ia.servings ?? null,
          prep_time_min: ia.prep_time_min ?? null,
          cook_time_min: ia.cook_time_min ?? null,
          total_time_min: ia.total_time_min ?? null,
        })
        .select()
        .single();
      if (recErr || !recData) throw recErr || new Error("Création recette impossible");

      const newRecipe = recData as Recipe;
      await loadRecipes();
      setSelectedRecipeId(newRecipe.id);

      setImportedForMapping(ia.ingredients || []);
      setMapperRecipeId(newRecipe.id);
      setMapperOpen(true);
      setShowAiImportModal(false);
      setAiImportUrl("");
    } catch (e: any) {
      console.error("handleAiImport error", e);
      setError(e?.message || "Import IA impossible.");
    } finally {
      setAiImportLoading(false);
    }
  };

  /* ---------- Import image ---------- */
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.includes(",") ? res.split(",")[1] : res;
      setImageBase64(base64);
      setImageFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleImageImport = async () => {
    if (!imageBase64) return;
    setImageImportLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai_import_recipe_image", {
        body: { base64: imageBase64, filename: imageFileName, household_id: household.id },
      });
      if (error) throw error;

      const ia = (data?.data || data) as {
        title: string;
        description?: string;
        web_url?: string;
        video_url?: string;
        servings?: number | null;
        prep_time_min?: number | null;
        cook_time_min?: number | null;
        total_time_min?: number | null;
        ingredients: ImportedIngredient[];
        steps?: string[];
      };

      const { data: recData, error: recErr } = await supabase
        .from("recipes")
        .insert({
          household_id: household.id,
          name: ia.title || "Recette importée",
          description: ia.steps?.join("\n") || ia.description || null,
          web_url: ia.web_url || null,
          video_url: ia.video_url || null,
          servings: ia.servings ?? null,
          prep_time_min: ia.prep_time_min ?? null,
          cook_time_min: ia.cook_time_min ?? null,
          total_time_min: ia.total_time_min ?? null,
        })
        .select()
        .single();
      if (recErr || !recData) throw recErr || new Error("Création recette impossible");

      const newRecipe = recData as Recipe;
      await loadRecipes();
      setSelectedRecipeId(newRecipe.id);

      setImportedForMapping(ia.ingredients || []);
      setMapperRecipeId(newRecipe.id);
      setMapperOpen(true);
      setShowImageImportModal(false);
      setImageBase64(null);
      setImageFileName(null);
    } catch (e: any) {
      console.error("handleImageImport error", e);
      setError(e?.message || "Import depuis image impossible.");
    } finally {
      setImageImportLoading(false);
    }
  };

  /* ---------- UI ---------- */
  return (
    <div className="min-h-screen bg-slate-50 px-3 md:px-6 py-4">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* En-tête */}
        <header className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-emerald-600">Catalogue des recettes du foyer</p>
            <p className="text-xs text-slate-500">
              Foyer <span className="font-semibold">{household.name}</span>
            </p>
          </div>
          {loading && <div className="text-xs text-slate-500">Chargement…</div>}
        </header>

        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</div>}
        {info && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-lg">{info}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          {/* Liste */}
          <aside className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="p-3 border-b">
              <div className="flex gap-2">
                <input
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  placeholder="Rechercher…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {canEdit && (
                  <button onClick={handleCreateRecipe} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs">
                    + Ajouter
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              {filteredRecipes.map((r) => {
                const roleLabel = roles.find((ro) => ro.id === r.role_id)?.label || "";
                const difficultyLabel = difficulties.find((d) => d.id === r.difficulty_id)?.label || "—";
                return (
                  <button
                    key={r.id}
                    className={`w-full text-left px-3 py-2 text-xs border-b hover:bg-slate-50 ${
                      selectedRecipeId === r.id ? "bg-emerald-50" : ""
                    }`}
                    onClick={() => setSelectedRecipeId(r.id)}
                  >
                    <div className="font-medium text-slate-900">{r.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {roleLabel || "Rôle n/c"} · Portions {r.servings ?? "—"} · {difficultyLabel}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Détail recette */}
          <section className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            {selectedRecipe ? (
              <div className="flex flex-col h-full">
                {/* En-tête recette */}
                <div className="p-4 border-b space-y-3">
                  <div className="flex items-start gap-2">
                    <input
                      className={`text-base font-semibold w-full border rounded-lg px-2 py-1.5 ${
                        !canEdit ? "text-slate-700" : "text-slate-900"
                      }`}
                      value={selectedRecipe.name}
                      onChange={(e) => handleUpdateRecipeField(selectedRecipe, { name: e.target.value })}
                      disabled={!canEdit}
                      placeholder="Nom de la recette"
                    />
                    {canEdit && (
                      <button
                        className="text-[11px] text-rose-600 hover:text-rose-700 px-2"
                        onClick={() => handleDeleteRecipe(selectedRecipe)}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[10px] leading-4">
                    {/* Rôle */}
                    <div className="flex flex-col">
                      <label className="text-slate-500 mb-1">Rôle</label>
                      <select
                        className="border rounded-lg px-2 py-2 h-9 bg-white"
                        value={selectedRecipe.role_id || ""}
                        onChange={(e) =>
                          handleUpdateRecipeField(selectedRecipe, { role_id: e.target.value ? Number(e.target.value) : null })
                        }
                        disabled={!canEdit}
                      >
                        <option value="">—</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Difficulté */}
                    <div className="flex flex-col">
                      <label className="text-slate-500 mb-1">Difficulté</label>
                      <select
                        className="border rounded-lg px-2 py-2 h-9 bg-white"
                        value={selectedRecipe.difficulty_id || ""}
                        onChange={(e) =>
                          handleUpdateRecipeField(selectedRecipe, {
                            difficulty_id: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        disabled={!canEdit}
                      >
                        <option value="">—</option>
                        {difficulties.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Origine */}
                    <div className="flex flex-col">
                      <label className="text-slate-500 mb-1">Origine</label>
                      <select
                        className="border rounded-lg px-2 py-2 h-9 bg-white"
                        value={selectedRecipe.origin_code || ""}
                        onChange={(e) => handleUpdateRecipeField(selectedRecipe, { origin_code: e.target.value || null })}
                        disabled={!canEdit}
                      >
                        <option value="">—</option>
                        {origins.map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Régime */}
                    <div className="flex flex-col">
                      <label className="text-slate-500 mb-1">Régime</label>
                      <select
                        className="border rounded-lg px-2 py-2 h-9 bg-white"
                        value={selectedRecipe.regime_code || ""}
                        onChange={(e) => handleUpdateRecipeField(selectedRecipe, { regime_code: e.target.value || null })}
                        disabled={!canEdit}
                      >
                        <option value="">—</option>
                        {regimes.map((g) => (
                          <option key={g.code} value={g.code}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Temps/Portions/Unité */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-[10px] leading-4">
                    <div className="flex flex-col">
                      <label className="text-slate-500 mb-1">Portions</label>
                      <input
                        type="number"
                        min={0}
                        className="border rounded-lg px-2 py-2 h-9"
                        value={selectedRecipe.servings ?? ""}
                        onChange={(e) => handleUpdateRecipeField(selectedRecipe, { servings: e.target.value ? Number(e.target.value) : null })}
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-slate-500 mb-1">Préparation (min)</label>
                      <input
                        type="number"
                        min={0}
                        className="border rounded-lg px-2 py-2 h-9"
                        value={selectedRecipe.prep_time_min ?? ""}
                        onChange={(e) =>
                          handleUpdateRecipeField(selectedRecipe, { prep_time_min: e.target.value ? Number(e.target.value) : null })
                        }
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-slate-500 mb-1">Cuisson (min)</label>
                      <input
                        type="number"
                        min={0}
                        className="border rounded-lg px-2 py-2 h-9"
                        value={selectedRecipe.cook_time_min ?? ""}
                        onChange={(e) =>
                          handleUpdateRecipeField(selectedRecipe, { cook_time_min: e.target.value ? Number(e.target.value) : null })
                        }
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-slate-500 mb-1">Total (min)</label>
                      <input
                        type="number"
                        min={0}
                        className="border rounded-lg px-2 py-2 h-9"
                        value={selectedRecipe.total_time_min ?? ""}
                        onChange={(e) =>
                          handleUpdateRecipeField(selectedRecipe, { total_time_min: e.target.value ? Number(e.target.value) : null })
                        }
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="inline-flex items-center gap-2 text-slate-700">
                        <input
                          type="checkbox"
                          checked={!!selectedRecipe.unitary_available}
                          onChange={(e) => handleUpdateRecipeField(selectedRecipe, { unitary_available: e.target.checked })}
                          disabled={!canEdit}
                        />
                        Divisible en unité
                      </label>
                    </div>
                  </div>

                  {/* Liens */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px] leading-4">
                    <div className="flex flex-col">
                      <label className="text-slate-500 mb-1">Lien web</label>
                      <input
                        type="url"
                        className="border rounded-lg px-2 py-2 h-9"
                        value={selectedRecipe.web_url || ""}
                        onChange={(e) => handleUpdateRecipeField(selectedRecipe, { web_url: e.target.value || null })}
                        disabled={!canEdit}
                        placeholder="https://…"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-slate-500 mb-1">Lien vidéo</label>
                      <input
                        type="url"
                        className="border rounded-lg px-2 py-2 h-9"
                        value={selectedRecipe.video_url || ""}
                        onChange={(e) => handleUpdateRecipeField(selectedRecipe, { video_url: e.target.value || null })}
                        disabled={!canEdit}
                        placeholder="https://…"
                      />
                    </div>
                  </div>
                </div>

                {/* Ingrédients */}
                <div className="p-4 flex-1 overflow-auto">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Ingrédients</h3>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <button onClick={handleAddIngredientRow} className="px-3 py-1.5 rounded-full border text-xs">
                          + Ajouter une ligne
                        </button>
                        <button onClick={() => setShowAiImportModal(true)} className="px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs">
                          Importer avec IA
                        </button>
                        <button
                          onClick={() => setShowImageImportModal(true)}
                          className="px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs"
                        >
                          Importer depuis image
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="border rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[1fr_180px_90px_90px_1fr_28px] gap-2 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600">
                      <div>Ingrédient</div>
                      <div>Catalogue</div>
                      <div className="text-center">Qté</div>
                      <div>Unité</div>
                      <div>Infos nutritionnelles</div>
                      <div></div>
                    </div>

                    <div>
                      {ingredients.length === 0 && (
                        <p className="text-[9px] text-slate-400 px-2 py-2">Aucun ingrédient pour cette recette.</p>
                      )}

                      {ingredients.map((ing) => {
                        const cat = ing.ingredient_catalog_id
                          ? ingredientCatalog.find((c) => c.id === ing.ingredient_catalog_id)
                          : null;
                        return (
                          <div
                            key={ing.id}
                            className="grid grid-cols-[1fr_180px_90px_90px_1fr_28px] gap-2 items-center px-2 py-1 border-t text-[10px] leading-4"
                          >
                            {/* Nom libre */}
                            <input
                              className="border rounded-lg px-2 h-8"
                              value={ing.ingredient_name || ""}
                              onChange={(e) => handleUpdateIngredient(ing, { ingredient_name: e.target.value })}
                              disabled={!canEdit}
                            />

                            {/* Catalogue */}
                            <select
                              className="border rounded-lg px-2 h-8 bg-white"
                              value={ing.ingredient_catalog_id || ""}
                              onChange={(e) =>
                                handleUpdateIngredient(ing, {
                                  ingredient_catalog_id: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                              disabled={!canEdit}
                            >
                              <option value="">—</option>
                              {ingredientCatalog.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.product_name}
                                </option>
                              ))}
                            </select>

                            {/* Qté */}
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="border rounded-lg px-2 h-8 text-right"
                              value={ing.quantity ?? ""}
                              onChange={(e) => handleUpdateIngredient(ing, { quantity: e.target.value ? Number(e.target.value) : null })}
                              disabled={!canEdit}
                            />

                            {/* Unité */}
                            <select
                              className="border rounded-lg px-2 h-8 bg-white"
                              value={ing.unit_code || ""}
                              onChange={(e) => handleUpdateIngredient(ing, { unit_code: e.target.value || null })}
                              disabled={!canEdit}
                            >
                              <option value="">—</option>
                              {units.map((u) => (
                                <option key={u.code} value={u.code}>
                                  {u.label}
                                </option>
                              ))}
                            </select>

                            {/* Infos nutri */}
                            <div className="text-[10px] text-slate-500 leading-4">
                              {cat ? (
                                <>
                                  <div>{cat.kcal_100g ?? "?"} kcal / 100g</div>
                                  <div>
                                    P {cat.protein_100g ?? "?"} · G {cat.carbs_100g ?? "?"} · L {cat.fat_100g ?? "?"}
                                  </div>
                                </>
                              ) : (
                                <span className="italic">Sélectionnez un ingrédient catalogue.</span>
                              )}
                            </div>

                            {/* Delete */}
                            {canEdit ? (
                              <button
                                onClick={() => handleDeleteIngredient(ing)}
                                className="text-[11px] text-rose-500 hover:text-rose-600 h-8 px-2"
                                title="Supprimer"
                              >
                                ✕
                              </button>
                            ) : (
                              <div />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">Aucune recette sélectionnée.</div>
            )}
          </section>
        </div>
      </div>

      {/* Modale import IA (URL) */}
      {showAiImportModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-4 space-y-3">
            <h3 className="text-base font-semibold">Importer une recette avec l&apos;IA</h3>
            <p className="text-xs text-slate-500">
              Collez l&apos;URL d&apos;une page recette. La fonction <code>ai_import_recipe</code> analysera le contenu et créera une recette
              structurée, que vous pourrez mapper.
            </p>
            <input
              type="url"
              value={aiImportUrl}
              onChange={(e) => setAiImportUrl(e.target.value)}
              placeholder="https://…"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAiImportModal(false)} className="px-3 py-1 rounded-full border text-xs" disabled={aiImportLoading}>
                Annuler
              </button>
              <button
                onClick={handleAiImport}
                className="px-4 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold disabled:opacity-60"
                disabled={aiImportLoading || !aiImportUrl.trim()}
              >
                {aiImportLoading ? "Analyse…" : "Importer avec IA"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale import depuis image */}
      {showImageImportModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-4 space-y-3">
            <h3 className="text-base font-semibold">Importer une recette à partir d&apos;une image</h3>
            <p className="text-xs text-slate-500">
              Chargez une photo lisible contenant une recette. <code>ai_import_recipe_image</code> tentera d&apos;en déduire les ingrédients et
              étapes.
            </p>
            <input type="file" accept="image/*" onChange={handleImageFileChange} className="w-full text-xs" />
            {imageFileName && <p className="text-[10px] text-slate-600">Fichier sélectionné : {imageFileName}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowImageImportModal(false);
                  setImageBase64(null);
                  setImageFileName(null);
                }}
                className="px-3 py-1 rounded-full border text-xs"
                disabled={imageImportLoading}
              >
                Annuler
              </button>
              <button
                onClick={handleImageImport}
                className="px-4 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold disabled:opacity-60"
                disabled={imageImportLoading || !imageBase64}
              >
                {imageImportLoading ? "Analyse…" : "Importer depuis l'image"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de mapping IA */}
      <IngredientMapperModal
        open={mapperOpen}
        onClose={() => setMapperOpen(false)}
        recipeId={mapperRecipeId}
        recipeTitle={mapperRecipeId ? recipes.find((r) => r.id === mapperRecipeId)?.name || null : null}
        imported={importedForMapping}
        ingredientCatalog={ingredientCatalog}
        units={units}
        roles={roles}
        origins={origins}
        regimes={regimes}
        difficulties={difficulties}
        recipeInitial={
          mapperRecipeId
            ? (() => {
                const r = recipes.find((x) => x.id === mapperRecipeId);
                return r
                  ? {
                      role_id: r.role_id ?? null,
                      origin_code: r.origin_code ?? null,
                      regime_code: r.regime_code ?? null,
                      difficulty_id: r.difficulty_id ?? null,
                      servings: r.servings ?? null,
                      prep_time_min: r.prep_time_min ?? null,
                      cook_time_min: r.cook_time_min ?? null,
                      total_time_min: r.total_time_min ?? null,
                      web_url: r.web_url ?? null,
                      video_url: r.video_url ?? null,
                    }
                  : null;
              })()
            : null
        }
        onCompleted={async () => {
          if (mapperRecipeId) {
            await loadIngredients(mapperRecipeId);
            await recomputeNutrition(mapperRecipeId);
          }
          setMapperRecipeId(null);
        }}
      />
    </div>
  );
};

export default RecipesPage;
