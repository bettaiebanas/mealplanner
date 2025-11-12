// ------------------------------------------------------
// Paramètres du foyer (MealPlanner V1)
//
// - Types de repas (table: meal_types, par foyer)
// - Formules de repas (table: meal_formulas, par foyer)
// - Rôles de recette (table: recipe_roles, globaux)
// - Origines de recette (table: recipe_origins, par foyer)
// - Régimes de recette (table: recipe_diets, par foyer)
// - Personnes du foyer (table: persons, par foyer)
//
// CRUD direct en base (si canEdit = true).
// ------------------------------------------------------

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Foyer minimal reçu depuis App.tsx
export type Household = {
  id: string;
  name: string;
};

type MealType = {
  id: string;
  household_id: string;
  code: string;
  label: string;
  base_coeff: number | null;
};

type MealFormula = {
  id: string;
  household_id: string;
  name: string;
  is_default: boolean;
};

type RecipeRole = {
  id: number;
  code: string;
  label: string;
};

type RecipeOrigin = {
  id: number;
  label: string;
};

type RecipeDiet = {
  id: number;
  label: string;
};

type Person = {
  id: string;
  household_id: string;
  display_name: string;
};

type Props = {
  household: Household | null;
  // Si false → lecture seule
  canEdit?: boolean;
};

export function HouseholdSettings({ household, canEdit = true }: Props) {
  // ---------------- ÉTATS GLOBAUX ----------------

  const [loading, setLoading] = useState(false);

  const [mealTypes, setMealTypes] = useState<MealType[]>([]);
  const [mealTypesError, setMealTypesError] = useState<string | null>(null);

  const [mealFormulas, setMealFormulas] = useState<MealFormula[]>([]);
  const [mealFormulasError, setMealFormulasError] =
    useState<string | null>(null);

  const [recipeRoles, setRecipeRoles] = useState<RecipeRole[]>([]);
  const [recipeRolesError, setRecipeRolesError] =
    useState<string | null>(null);

  const [origins, setOrigins] = useState<RecipeOrigin[]>([]);
  const [originsError, setOriginsError] = useState<string | null>(null);

  const [diets, setDiets] = useState<RecipeDiet[]>([]);
  const [dietsError, setDietsError] = useState<string | null>(null);

  const [persons, setPersons] = useState<Person[]>([]);
  const [personsError, setPersonsError] = useState<string | null>(null);

  // Inputs ajout
  const [newMealTypeCode, setNewMealTypeCode] = useState("");
  const [newMealTypeLabel, setNewMealTypeLabel] = useState("");

  const [newFormulaName, setNewFormulaName] = useState("");

  const [newRoleCode, setNewRoleCode] = useState("");
  const [newRoleLabel, setNewRoleLabel] = useState("");

  const [newOriginLabel, setNewOriginLabel] = useState("");
  const [newDietLabel, setNewDietLabel] = useState("");

  const [newPersonName, setNewPersonName] = useState("");

  // ---------------- CHARGEMENT GLOBAL ----------------

  useEffect(() => {
    const loadAll = async () => {
      if (!household) {
        console.log("[HouseholdSettings] reset (no household)");
        setMealTypes([]);
        setMealFormulas([]);
        setRecipeRoles([]);
        setOrigins([]);
        setDiets([]);
        setPersons([]);
        return;
      }

      console.log(
        "[HouseholdSettings] LOAD ALL for household",
        household.id,
        household.name
      );

      setLoading(true);
      await Promise.all([
        loadMealTypes(household.id),
        loadMealFormulas(household.id),
        loadRecipeRoles(),
        loadRecipeOrigins(household.id),
        loadRecipeDiets(household.id),
        loadPersons(household.id),
      ]);
      setLoading(false);

      console.log("[HouseholdSettings] LOAD ALL done");
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    loadAll();
  }, [household?.id]);

  // ---------------- LOADERS ----------------

  const loadMealTypes = async (householdId: string) => {
    setMealTypesError(null);

    const { data, error } = await supabase
      .from("meal_types")
      .select("id, household_id, code, label, base_coeff")
      .eq("household_id", householdId)
      .order("code");

    if (error) {
      console.error("meal_types error", error);
      setMealTypesError("Impossible de charger les types de repas.");
      setMealTypes([]);
      return;
    }

    setMealTypes((data as MealType[]) ?? []);
  };

  const loadMealFormulas = async (householdId: string) => {
    setMealFormulasError(null);

    const { data, error } = await supabase
      .from("meal_formulas")
      .select("id, household_id, name, is_default")
      .eq("household_id", householdId)
      .order("name");

    if (error) {
      console.error("meal_formulas error", error);
      setMealFormulasError("Impossible de charger les formules de repas.");
      setMealFormulas([]);
      return;
    }

    setMealFormulas((data as MealFormula[]) ?? []);
  };

  const loadRecipeRoles = async () => {
    setRecipeRolesError(null);

    const { data, error } = await supabase
      .from("recipe_roles")
      .select("id, code, label")
      .order("id", { ascending: true });

    if (error) {
      console.error("recipe_roles error", error);
      setRecipeRolesError("Impossible de charger les rôles de recette.");
      setRecipeRoles([]);
      return;
    }

    setRecipeRoles((data as RecipeRole[]) ?? []);
  };

  const loadRecipeOrigins = async (householdId: string) => {
    setOriginsError(null);

    const { data, error } = await supabase
      .from("recipe_origins")
      .select("id, label")
      .eq("household_id", householdId)
      .order("label", { ascending: true });

    if (error) {
      console.error("recipe_origins error", error);
      setOriginsError("Impossible de charger les origines de recette.");
      setOrigins([]);
      return;
    }

    setOrigins((data as RecipeOrigin[]) ?? []);
  };

  const loadRecipeDiets = async (householdId: string) => {
    setDietsError(null);

    const { data, error } = await supabase
      .from("recipe_diets")
      .select("id, label")
      .eq("household_id", householdId)
      .order("label", { ascending: true });

    if (error) {
      console.error("recipe_diets error", error);
      setDietsError("Impossible de charger les régimes.");
      setDiets([]);
      return;
    }

    setDiets((data as RecipeDiet[]) ?? []);
  };

  const loadPersons = async (householdId: string) => {
    setPersonsError(null);

    const { data, error } = await supabase
      .from("persons")
      .select("id, household_id, display_name")
      .eq("household_id", householdId)
      .order("display_name", { ascending: true });

    if (error) {
      console.error("persons error", error);
      setPersonsError("Impossible de charger les personnes du foyer.");
      setPersons([]);
      return;
    }

    setPersons((data as Person[]) ?? []);
  };

  // ---------------- ACTIONS : MEAL TYPES ----------------

  const handleAddMealType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !household) return;

    const code = newMealTypeCode.trim().toUpperCase();
    const label = newMealTypeLabel.trim();
    if (!code || !label) return;

    const { error } = await supabase.from("meal_types").insert({
      household_id: household.id,
      code,
      label,
      base_coeff: 1,
    });

    if (error) {
      console.error("add meal_type error", error);
      setMealTypesError("Impossible d'ajouter ce type de repas.");
      return;
    }

    setNewMealTypeCode("");
    setNewMealTypeLabel("");
    await loadMealTypes(household.id);
  };

  const handleUpdateMealType = async (
    mt: MealType,
    patch: Partial<Pick<MealType, "label" | "base_coeff">>
  ) => {
    if (!canEdit) return;

    const { error } = await supabase
      .from("meal_types")
      .update(patch)
      .eq("id", mt.id);

    if (error) {
      console.error("update meal_type error", error);
      setMealTypesError("Impossible de modifier ce type de repas.");
      return;
    }

    if (household) await loadMealTypes(household.id);
  };

  const handleDeleteMealType = async (mt: MealType) => {
    if (!canEdit || !household) return;

    const { error } = await supabase
      .from("meal_types")
      .delete()
      .eq("id", mt.id);

    if (error) {
      console.error("delete meal_type error", error);
      setMealTypesError("Impossible de supprimer ce type de repas.");
      return;
    }

    await loadMealTypes(household.id);
  };

  // ---------------- ACTIONS : MEAL FORMULAS ----------------

  const handleAddMealFormula = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !household) return;

    const name = newFormulaName.trim();
    if (!name) return;

    const { error } = await supabase.from("meal_formulas").insert({
      household_id: household.id,
      name,
      is_default: false,
    });

    if (error) {
      console.error("add meal_formula error", error);
      setMealFormulasError("Impossible d'ajouter cette formule.");
      return;
    }

    setNewFormulaName("");
    await loadMealFormulas(household.id);
  };

  const handleUpdateMealFormula = async (f: MealFormula, newName: string) => {
    if (!canEdit) return;

    const name = newName.trim();
    if (!name) return;

    const { error } = await supabase
      .from("meal_formulas")
      .update({ name })
      .eq("id", f.id);

    if (error) {
      console.error("update meal_formula error", error);
      setMealFormulasError("Impossible de modifier cette formule.");
      return;
    }

    if (household) await loadMealFormulas(household.id);
  };

  const handleSetDefaultFormula = async (f: MealFormula) => {
    if (!canEdit || !household) return;

    const householdId = household.id;

    const { error: clearErr } = await supabase
      .from("meal_formulas")
      .update({ is_default: false })
      .eq("household_id", householdId);

    if (clearErr) {
      console.error("clear default formula error", clearErr);
      setMealFormulasError("Impossible de changer la formule par défaut.");
      return;
    }

    const { error: setErr } = await supabase
      .from("meal_formulas")
      .update({ is_default: true })
      .eq("id", f.id);

    if (setErr) {
      console.error("set default formula error", setErr);
      setMealFormulasError("Impossible de changer la formule par défaut.");
      return;
    }

    await loadMealFormulas(householdId);
  };

  const handleDeleteMealFormula = async (f: MealFormula) => {
    if (!canEdit || !household) return;

    const { error } = await supabase
      .from("meal_formulas")
      .delete()
      .eq("id", f.id);

    if (error) {
      console.error("delete meal_formula error", error);
      setMealFormulasError("Impossible de supprimer cette formule.");
      return;
    }

    await loadMealFormulas(household.id);
  };

  // ---------------- ACTIONS : RECIPE ROLES (GLOBAUX) ----------------

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    const code = newRoleCode.trim().toUpperCase();
    const label = newRoleLabel.trim();
    if (!code || !label) return;

    const { error } = await supabase
      .from("recipe_roles")
      .insert({ code, label });

    if (error) {
      console.error("add recipe_role error", error);
      setRecipeRolesError("Impossible d'ajouter ce rôle.");
      return;
    }

    setNewRoleCode("");
    setNewRoleLabel("");
    await loadRecipeRoles();
  };

  const handleUpdateRoleLabel = async (id: number, newLabel: string) => {
    if (!canEdit) return;

    const label = newLabel.trim();
    if (!label) return;

    const { error } = await supabase
      .from("recipe_roles")
      .update({ label })
      .eq("id", id);

    if (error) {
      console.error("update recipe_role error", error);
      setRecipeRolesError("Impossible de modifier ce rôle.");
      return;
    }

    await loadRecipeRoles();
  };

  const handleDeleteRole = async (id: number) => {
    if (!canEdit) return;

    const { error } = await supabase
      .from("recipe_roles")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("delete recipe_role error", error);
      setRecipeRolesError("Impossible de supprimer ce rôle.");
      return;
    }

    await loadRecipeRoles();
  };

  // ---------------- ACTIONS : ORIGINES ----------------

  const handleAddOrigin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !household) return;

    const label = newOriginLabel.trim();
    if (!label) return;

    const { error } = await supabase.from("recipe_origins").insert({
      household_id: household.id,
      label,
    });

    if (error) {
      console.error("add recipe_origin error", error);
      setOriginsError("Impossible d'ajouter cette origine.");
      return;
    }

    setNewOriginLabel("");
    await loadRecipeOrigins(household.id);
  };

  const handleUpdateOriginLabel = async (id: number, newLabel: string) => {
    if (!canEdit) return;

    const label = newLabel.trim();
    if (!label) return;

    const { error } = await supabase
      .from("recipe_origins")
      .update({ label })
      .eq("id", id);

    if (error) {
      console.error("update recipe_origin error", error);
      setOriginsError("Impossible de modifier cette origine.");
      return;
    }

    if (household) await loadRecipeOrigins(household.id);
  };

  const handleDeleteOrigin = async (id: number) => {
    if (!canEdit || !household) return;

    const { error } = await supabase
      .from("recipe_origins")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("delete recipe_origin error", error);
      setOriginsError("Impossible de supprimer cette origine.");
      return;
    }

    await loadRecipeOrigins(household.id);
  };

  // ---------------- ACTIONS : DIETS ----------------

  const handleAddDiet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !household) return;

    const label = newDietLabel.trim();
    if (!label) return;

    const { error } = await supabase.from("recipe_diets").insert({
      household_id: household.id,
      label,
    });

    if (error) {
      console.error("add recipe_diet error", error);
      setDietsError("Impossible d'ajouter ce régime.");
      return;
    }

    setNewDietLabel("");
    await loadRecipeDiets(household.id);
  };

  const handleUpdateDietLabel = async (id: number, newLabel: string) => {
    if (!canEdit) return;

    const label = newLabel.trim();
    if (!label) return;

    const { error } = await supabase
      .from("recipe_diets")
      .update({ label })
      .eq("id", id);

    if (error) {
      console.error("update recipe_diet error", error);
      setDietsError("Impossible de modifier ce régime.");
      return;
    }

    if (household) await loadRecipeDiets(household.id);
  };

  const handleDeleteDiet = async (id: number) => {
    if (!canEdit || !household) return;

    const { error } = await supabase
      .from("recipe_diets")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("delete recipe_diet error", error);
      setDietsError("Impossible de supprimer ce régime.");
      return;
    }

    await loadRecipeDiets(household.id);
  };

  // ---------------- ACTIONS : PERSONNES ----------------

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !household) return;

    const name = newPersonName.trim();
    if (!name) return;

    const { error } = await supabase.from("persons").insert({
      household_id: household.id,
      display_name: name,
    });

    if (error) {
      console.error("add person error", error);
      setPersonsError("Impossible d'ajouter cette personne.");
      return;
    }

    setNewPersonName("");
    await loadPersons(household.id);
  };

  const handleDeletePerson = async (person: Person) => {
    if (!canEdit || !household) return;

    const { error } = await supabase
      .from("persons")
      .delete()
      .eq("id", person.id)
      .eq("household_id", household.id);

    if (error) {
      console.error("delete person error", error);
      setPersonsError("Impossible de supprimer cette personne.");
      return;
    }

    await loadPersons(household.id);
  };

  // ---------------- RENDER ----------------

  if (!household) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <h2 className="text-2xl font-semibold text-slate-800 mb-2">
        Paramètres du foyer : {household.name}
      </h2>

      {loading && (
        <p className="text-sm text-slate-500">
          Chargement des paramètres…
        </p>
      )}

      {/* -------- Personnes du foyer -------- */}
      <section className="bg-white border rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-1">
          Personnes du foyer (par foyer)
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Liste des personnes appartenant à ce foyer. Servira plus tard pour
          les règles de calcul (parts, préférences, etc.).
        </p>

        <ul className="space-y-1 mb-3">
          {persons.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between text-sm text-slate-700"
            >
              <span>{p.display_name}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDeletePerson(p)}
                  className="text-[10px] text-rose-500 hover:text-rose-600"
                >
                  Suppr.
                </button>
              )}
            </li>
          ))}
          {persons.length === 0 && (
            <li className="text-xs text-slate-400">
              Aucune personne encore définie pour ce foyer.
            </li>
          )}
        </ul>

        {canEdit && (
          <form
            onSubmit={handleAddPerson}
            className="flex gap-2 items-center mt-2"
          >
            <input
              type="text"
              className="flex-1 px-3 py-2 rounded-md border text-sm"
              placeholder="Nom / prénom"
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-md bg-indigo-500 text-white text-xs font-medium"
            >
              Ajouter
            </button>
          </form>
        )}

        {personsError && (
          <p className="mt-2 text-xs text-red-500">{personsError}</p>
        )}
      </section>

      {/* -------- Types de repas -------- */}
      <section className="bg-white border rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-1">
          Types de repas (par foyer)
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Utilisés pour le planning et les coefficients.
        </p>

        <ul className="space-y-1 mb-3">
          {mealTypes.map((mt) => (
            <li
              key={mt.id}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <span className="font-mono text-[10px] text-slate-500 w-14">
                {mt.code}
              </span>
              <input
                type="text"
                defaultValue={mt.label}
                disabled={!canEdit}
                onBlur={(e) => {
                  if (e.target.value !== mt.label) {
                    void handleUpdateMealType(mt, { label: e.target.value });
                  }
                }}
                className={
                  "flex-1 px-2 py-1 rounded border text-sm " +
                  (!canEdit ? "bg-slate-50 text-slate-500" : "")
                }
              />
              <input
                type="number"
                step="0.1"
                defaultValue={mt.base_coeff ?? 1}
                disabled={!canEdit}
                onBlur={(e) => {
                  const v = Number(e.target.value || "1");
                  if (v !== (mt.base_coeff ?? 1)) {
                    void handleUpdateMealType(mt, { base_coeff: v });
                  }
                }}
                className={
                  "w-20 px-2 py-1 rounded border text-xs text-right " +
                  (!canEdit ? "bg-slate-50 text-slate-500" : "")
                }
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleDeleteMealType(mt)}
                  className="text-[10px] text-rose-500 hover:text-rose-600"
                >
                  Suppr.
                </button>
              )}
            </li>
          ))}
          {mealTypes.length === 0 && (
            <li className="text-xs text-slate-400">
              Aucun type défini.
            </li>
          )}
        </ul>

        {canEdit && (
          <form
            onSubmit={handleAddMealType}
            className="flex gap-2 items-center mt-2"
          >
            <input
              type="text"
              className="w-24 px-2 py-2 rounded-md border text-xs font-mono"
              placeholder="CODE"
              value={newMealTypeCode}
              onChange={(e) => setNewMealTypeCode(e.target.value)}
            />
            <input
              type="text"
              className="flex-1 px-3 py-2 rounded-md border text-sm"
              placeholder="Libellé"
              value={newMealTypeLabel}
              onChange={(e) => setNewMealTypeLabel(e.target.value)}
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-md bg-indigo-500 text-white text-xs font-medium"
            >
              Ajouter
            </button>
          </form>
        )}

        {mealTypesError && (
          <p className="mt-2 text-xs text-red-500">{mealTypesError}</p>
        )}
      </section>

      {/* -------- Formules de repas -------- */}
      <section className="bg-white border rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-1">
          Formules de repas (par foyer)
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Exemple : Plat unique, Entrée + Plat, Plat + Dessert…
        </p>

        <ul className="space-y-1 mb-3">
          {mealFormulas.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <input
                type="text"
                defaultValue={f.name}
                disabled={!canEdit}
                onBlur={(e) => {
                  if (e.target.value !== f.name) {
                    void handleUpdateMealFormula(f, e.target.value);
                  }
                }}
                className={
                  "flex-1 px-2 py-1 rounded border text-sm " +
                  (!canEdit ? "bg-slate-50 text-slate-500" : "")
                }
              />
              {f.is_default && (
                <span className="text-[10px] text-indigo-500 uppercase">
                  défaut
                </span>
              )}
              {canEdit && !f.is_default && (
                <button
                  type="button"
                  onClick={() => void handleSetDefaultFormula(f)}
                  className="text-[10px] text-indigo-500 hover:text-indigo-600"
                >
                  Défaut
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleDeleteMealFormula(f)}
                  className="text-[10px] text-rose-500 hover:text-rose-600"
                >
                  Suppr.
                </button>
              )}
            </li>
          ))}
          {mealFormulas.length === 0 && (
            <li className="text-xs text-slate-400">
              Aucune formule définie.
            </li>
          )}
        </ul>

        {canEdit && (
          <form
            onSubmit={handleAddMealFormula}
            className="flex gap-2 items-center mt-2"
          >
            <input
              type="text"
              className="flex-1 px-3 py-2 rounded-md border text-sm"
              placeholder="Nouvelle formule"
              value={newFormulaName}
              onChange={(e) => setNewFormulaName(e.target.value)}
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-md bg-indigo-500 text-white text-xs font-medium"
            >
              Ajouter
            </button>
          </form>
        )}

        {mealFormulasError && (
          <p className="mt-2 text-xs text-red-500">{mealFormulasError}</p>
        )}
      </section>

      {/* -------- Rôles de recette (globaux) -------- */}
      <section className="bg-white border rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-1">
          Rôles de recette (globaux)
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Entrée, Plat, Dessert, Plat unique… utilisés dans les recettes.
        </p>

        <ul className="space-y-1 mb-3">
          {recipeRoles.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <input
                type="text"
                defaultValue={r.label}
                disabled={!canEdit}
                onBlur={(e) => {
                  if (e.target.value !== r.label) {
                    void handleUpdateRoleLabel(r.id, e.target.value);
                  }
                }}
                className={
                  "flex-1 px-2 py-1 rounded border text-sm " +
                  (!canEdit ? "bg-slate-50 text-slate-500" : "")
                }
              />
              <span className="font-mono text-[10px] text-slate-400 w-24">
                {r.code}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleDeleteRole(r.id)}
                  className="text-[10px] text-rose-500 hover:text-rose-600"
                >
                  Suppr.
                </button>
              )}
            </li>
          ))}
          {recipeRoles.length === 0 && (
            <li className="text-xs text-slate-400">
              Aucun rôle défini.
            </li>
          )}
        </ul>

        {canEdit && (
          <form
            onSubmit={handleAddRole}
            className="flex gap-2 items-center mt-2"
          >
            <input
              type="text"
              className="w-24 px-2 py-2 rounded-md border text-xs font-mono"
              placeholder="CODE"
              value={newRoleCode}
              onChange={(e) => setNewRoleCode(e.target.value)}
            />
            <input
              type="text"
              className="flex-1 px-3 py-2 rounded-md border text-sm"
              placeholder="Libellé du rôle"
              value={newRoleLabel}
              onChange={(e) => setNewRoleLabel(e.target.value)}
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-md bg-indigo-500 text-white text-xs font-medium"
            >
              Ajouter
            </button>
          </form>
        )}

        {recipeRolesError && (
          <p className="mt-2 text-xs text-red-500">{recipeRolesError}</p>
        )}
      </section>

      {/* -------- Origines -------- */}
      <section className="bg-white border rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-1">
          Origines des recettes (par foyer)
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Ces valeurs alimentent la liste déroulante "Origine" dans les
          recettes.
        </p>

        <ul className="space-y-1 mb-3">
          {origins.map((o) => (
            <li
              key={o.id}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <input
                type="text"
                defaultValue={o.label}
                disabled={!canEdit}
                onBlur={(e) => {
                  if (e.target.value !== o.label) {
                    void handleUpdateOriginLabel(o.id, e.target.value);
                  }
                }}
                className={
                  "flex-1 px-2 py-1 rounded border text-sm " +
                  (!canEdit ? "bg-slate-50 text-slate-500" : "")
                }
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleDeleteOrigin(o.id)}
                  className="text-[10px] text-rose-500 hover:text-rose-600"
                >
                  Suppr.
                </button>
              )}
            </li>
          ))}
          {origins.length === 0 && (
            <li className="text-xs text-slate-400">
              Aucune origine définie.
            </li>
          )}
        </ul>

        {canEdit && (
          <form
            onSubmit={handleAddOrigin}
            className="flex gap-2 items-center mt-2"
          >
            <input
              type="text"
              className="flex-1 px-3 py-2 rounded-md border text-sm"
              placeholder="Nouvelle origine (ex: Italienne)"
              value={newOriginLabel}
              onChange={(e) => setNewOriginLabel(e.target.value)}
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-md bg-emerald-500 text-white text-xs font-medium"
            >
              Ajouter
            </button>
          </form>
        )}

        {originsError && (
          <p className="mt-2 text-xs text-red-500">{originsError}</p>
        )}
      </section>

      {/* -------- Régimes -------- */}
      <section className="bg-white border rounded-xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-1">
          Régimes (par foyer)
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Ces valeurs alimentent la liste déroulante "Régime" dans les
          recettes.
        </p>

        <ul className="space-y-1 mb-3">
          {diets.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <input
                type="text"
                defaultValue={d.label}
                disabled={!canEdit}
                onBlur={(e) => {
                  if (e.target.value !== d.label) {
                    void handleUpdateDietLabel(d.id, e.target.value);
                  }
                }}
                className={
                  "flex-1 px-2 py-1 rounded border text-sm " +
                  (!canEdit ? "bg-slate-50 text-slate-500" : "")
                }
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleDeleteDiet(d.id)}
                  className="text-[10px] text-rose-500 hover:text-rose-600"
                >
                  Suppr.
                </button>
              )}
            </li>
          ))}
          {diets.length === 0 && (
            <li className="text-xs text-slate-400">
              Aucun régime défini.
            </li>
          )}
        </ul>

        {canEdit && (
          <form
            onSubmit={handleAddDiet}
            className="flex gap-2 items-center mt-2"
          >
            <input
              type="text"
              className="flex-1 px-3 py-2 rounded-md border text-sm"
              placeholder="Nouveau régime (ex: Keto)"
              value={newDietLabel}
              onChange={(e) => setNewDietLabel(e.target.value)}
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-md bg-emerald-500 text-white text-xs font-medium"
            >
              Ajouter
            </button>
          </form>
        )}

        {dietsError && (
          <p className="mt-2 text-xs text-red-500">{dietsError}</p>
        )}
      </section>
    </div>
  );
}

export default HouseholdSettings;
