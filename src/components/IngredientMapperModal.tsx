// src/components/IngredientMapperModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export type ImportedIngredient = {
  raw: string;
  amount?: number | null;
  unit?: string | null;
  ingredient?: string | null;
};

type IngredientCatalog = {
  id: number;
  product_name: string;
  standard_unit_code: string;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
};

type Unit = { code: string; label: string };

type Role = { id: number; label: string };
type Origin = { code: string; label: string };
type Regime = { code: string; label: string };
type Difficulty = { id: number; label: string };

type MapperRow = {
  id: number;
  imported: ImportedIngredient;
  mode: "catalog" | "proposed";
  catalogId?: number | null;
  proposedName: string;
  addToCatalog: boolean;
  quantity: number | null;
  unitCode: string | null;
};

type RecipeInitial = {
  role_id?: number | null;
  origin_code?: string | null;
  regime_code?: string | null;
  difficulty_id?: number | null;
  servings?: number | null;
  prep_time_min?: number | null;
  cook_time_min?: number | null;
  total_time_min?: number | null;
  web_url?: string | null;
  video_url?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  recipeId: string | null;
  recipeTitle: string | null;
  imported: ImportedIngredient[];
  ingredientCatalog: IngredientCatalog[];
  units: Unit[];

  // référentiels pour l’entête
  roles: Role[];
  origins: Origin[];
  regimes: Regime[];
  difficulties: Difficulty[];

  recipeInitial?: RecipeInitial | null;
  onCompleted: () => void;
};

function normalize(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function guessCatalogMatch(
  imported: ImportedIngredient,
  catalog: IngredientCatalog[],
): IngredientCatalog | null {
  const target = normalize(imported.ingredient || imported.raw || "");
  if (!target) return null;

  let best: { item: IngredientCatalog | null; score: number } = { item: null, score: 0 };

  for (const item of catalog) {
    const base = normalize(item.product_name);
    if (!base) continue;

    if (base === target) return item;

    if (base.includes(target) || target.includes(base)) {
      const score = Math.min(base.length, target.length);
      if (score > best.score) best = { item, score };
    }
  }
  return best.item;
}

const IngredientMapperModal: React.FC<Props> = ({
  open,
  onClose,
  recipeId,
  recipeTitle,
  imported,
  ingredientCatalog,
  units,
  roles,
  origins,
  regimes,
  difficulties,
  recipeInitial,
  onCompleted,
}) => {
  const [rows, setRows] = useState<MapperRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ——— entête (éditable) ———
  const [roleId, setRoleId] = useState<number | "">(recipeInitial?.role_id ?? "");
  const [origin, setOrigin] = useState<string>(recipeInitial?.origin_code ?? "");
  const [regime, setRegime] = useState<string>(recipeInitial?.regime_code ?? "");
  const [difficultyId, setDifficultyId] = useState<number | "">(recipeInitial?.difficulty_id ?? "");
  const [servings, setServings] = useState<string>(
    recipeInitial?.servings != null ? String(recipeInitial?.servings) : "",
  );
  const [prep, setPrep] = useState<string>(
    recipeInitial?.prep_time_min != null ? String(recipeInitial?.prep_time_min) : "",
  );
  const [cook, setCook] = useState<string>(
    recipeInitial?.cook_time_min != null ? String(recipeInitial?.cook_time_min) : "",
  );
  const [total, setTotal] = useState<string>(
    recipeInitial?.total_time_min != null ? String(recipeInitial?.total_time_min) : "",
  );
  const [webUrl, setWebUrl] = useState<string>(recipeInitial?.web_url ?? "");
  const [videoUrl, setVideoUrl] = useState<string>(recipeInitial?.video_url ?? "");

  useEffect(() => {
    setRoleId(recipeInitial?.role_id ?? "");
    setOrigin(recipeInitial?.origin_code ?? "");
    setRegime(recipeInitial?.regime_code ?? "");
    setDifficultyId(recipeInitial?.difficulty_id ?? "");
    setServings(recipeInitial?.servings != null ? String(recipeInitial?.servings) : "");
    setPrep(recipeInitial?.prep_time_min != null ? String(recipeInitial?.prep_time_min) : "");
    setCook(recipeInitial?.cook_time_min != null ? String(recipeInitial?.cook_time_min) : "");
    setTotal(recipeInitial?.total_time_min != null ? String(recipeInitial?.total_time_min) : "");
    setWebUrl(recipeInitial?.web_url ?? "");
    setVideoUrl(recipeInitial?.video_url ?? "");
  }, [recipeInitial]);

  // ——— lignes à mapper ———
  useEffect(() => {
    const toRows: MapperRow[] = (imported || []).map((ing, idx) => {
      const guess = guessCatalogMatch(ing, ingredientCatalog);
      const unitLower = (ing.unit || "").toLowerCase();
      const unitGuess =
        units.find(
          (u) =>
            u.code.toLowerCase() === unitLower ||
            u.label.toLowerCase() === unitLower ||
            (unitLower === "grammes" && u.code === "g"),
        )?.code || null;

      return {
        id: idx + 1,
        imported: ing,
        mode: guess ? "catalog" : "proposed",
        catalogId: guess?.id || null,
        proposedName: ing.ingredient || ing.raw || "",
        addToCatalog: false,
        quantity: ing.amount ?? null,
        unitCode: unitGuess,
      };
    });
    setRows(toRows);
  }, [imported, ingredientCatalog, units]);

  const hasContent = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.mode === "catalog" && !!r.catalogId) ||
          (r.mode === "proposed" && r.addToCatalog && r.proposedName.trim().length > 0),
      ),
    [rows],
  );

  // ——— handlers lignes ———
  const handleSwitchMode = (id: number, mode: "catalog" | "proposed") =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, mode } : r)));

  const handleSelectCatalog = (id: number, catalogId: number | null) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, catalogId } : r)));

  const handleChangeProposedName = (id: number, name: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, proposedName: name } : r)));

  const handleToggleAddToCatalog = (id: number) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, addToCatalog: !r.addToCatalog } : r)));

  const handleChangeQty = (id: number, value: string) => {
    const q = value ? Number(value) : null;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, quantity: q } : r)));
  };

  const handleChangeUnit = (id: number, code: string) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, unitCode: code || null } : r)));

  // ——— save ———
  const handleSave = async () => {
    if (!recipeId) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);

    try {
      // 0) patch recette
      const patch: any = {
        role_id: roleId || null,
        origin_code: origin || null,
        regime_code: regime || null,
        difficulty_id: difficultyId || null,
        servings: servings ? Number(servings) : null,
        prep_time_min: prep ? Number(prep) : null,
        cook_time_min: cook ? Number(cook) : null,
        total_time_min: total ? Number(total) : null,
        web_url: webUrl || null,
        video_url: videoUrl || null,
      };
      await supabase.from("recipes").update(patch).eq("id", recipeId);

      // 1) création éventuelle d’ingrédients de catalogue
      const toCreate = rows.filter(
        (r) => r.mode === "proposed" && r.addToCatalog && r.proposedName.trim().length > 0,
      );

      const createdIds: Record<number, number> = {};
      if (toCreate.length > 0) {
        const payload = toCreate.map((r) => ({
          product_name: r.proposedName.trim(),
          standard_unit_code: r.unitCode || "g",
          kcal_100g: null,
          protein_100g: null,
          carbs_100g: null,
          fat_100g: null,
        }));

        const { data, error } = await supabase.from("ingredient_catalog").insert(payload).select();
        if (error) {
          if ((error as any).code === "42501" || /row-level security/i.test(error.message)) {
            throw new Error(
              "Impossible d'ajouter certains ingrédients au catalogue (vérifiez les politiques RLS de 'ingredient_catalog').",
            );
          }
          throw error;
        }

        // map robuste par product_name
        const byName = new Map<string, number>();
        (data as any[]).forEach((c) =>
          byName.set(String(c.product_name).trim().toLowerCase(), Number(c.id)),
        );
        for (const r of toCreate) {
          const id = byName.get(r.proposedName.trim().toLowerCase());
          if (id) createdIds[r.id] = id;
        }
      }

      // 2) insert des recipe_ingredients (toujours avec ingredient_name non null)
      const recipeIngredients: any[] = [];

      for (const r of rows) {
        if (r.mode === "catalog" && r.catalogId) {
          const cat = ingredientCatalog.find((c) => c.id === r.catalogId);
          recipeIngredients.push({
            recipe_id: recipeId,
            ingredient_catalog_id: r.catalogId,
            ingredient_name: cat?.product_name || r.proposedName || "Ingrédient",
            ingredient_category: "principal",
            quantity: r.quantity,
            unit_code: r.unitCode,
          });
          continue;
        }
        if (r.mode === "proposed" && r.addToCatalog) {
          const newId = createdIds[r.id];
          if (!newId) continue;
          recipeIngredients.push({
            recipe_id: recipeId,
            ingredient_catalog_id: newId,
            ingredient_name: r.proposedName || "Ingrédient",
            ingredient_category: "principal",
            quantity: r.quantity,
            unit_code: r.unitCode,
          });
        }
      }

      if (recipeIngredients.length > 0) {
        const { error } = await supabase.from("recipe_ingredients").insert(recipeIngredients);
        if (error) throw error;
      }

      onClose();
      onCompleted();
    } catch (e: any) {
      console.error("Ingredient mapping save error", e);
      setError(e?.message || "Erreur lors de l'enregistrement des ingrédients.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-10">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Mapper les ingrédients importés avec l&apos;IA</h2>
            {recipeTitle && (
              <p className="text-xs text-slate-600">
                Recette : <span className="font-semibold">{recipeTitle}</span>
              </p>
            )}
            <p className="text-[10px] text-slate-500 mt-1">
              Pour chaque ligne : choisissez <b>Catalogue</b> pour lier à un ingrédient existant, ou
              utilisez <b>Ingrédient proposé</b> et cochez <b>Ajouter au catalogue</b> pour le créer.
            </p>
          </div>
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-800" disabled={saving}>
            ✕
          </button>
        </div>

        {/* Recipe meta in modal */}
        <div className="px-5 py-3 border-b">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 text-[10px] leading-4">
            <div className="flex flex-col">
              <label className="text-slate-500 mb-1">Rôle</label>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : "")}
                className="border rounded-lg px-2 py-2 h-9 bg-white"
              >
                <option value="">—</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-slate-500 mb-1">Difficulté</label>
              <select
                value={difficultyId}
                onChange={(e) => setDifficultyId(e.target.value ? Number(e.target.value) : "")}
                className="border rounded-lg px-2 py-2 h-9 bg-white"
              >
                <option value="">—</option>
                {difficulties.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-slate-500 mb-1">Origine</label>
              <select
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="border rounded-lg px-2 py-2 h-9 bg-white"
              >
                <option value="">—</option>
                {origins.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-slate-500 mb-1">Régime</label>
              <select
                value={regime}
                onChange={(e) => setRegime(e.target.value)}
                className="border rounded-lg px-2 py-2 h-9 bg-white"
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

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mt-3 text-[10px] leading-4">
            <div className="flex flex-col">
              <label className="text-slate-500 mb-1">Portions</label>
              <input
                type="number"
                min={0}
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className="border rounded-lg px-2 py-2 h-9"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-slate-500 mb-1">Préparation (min)</label>
              <input type="number" min={0} value={prep} onChange={(e) => setPrep(e.target.value)} className="border rounded-lg px-2 py-2 h-9" />
            </div>
            <div className="flex flex-col">
              <label className="text-slate-500 mb-1">Cuisson (min)</label>
              <input type="number" min={0} value={cook} onChange={(e) => setCook(e.target.value)} className="border rounded-lg px-2 py-2 h-9" />
            </div>
            <div className="flex flex-col">
              <label className="text-slate-500 mb-1">Total (min)</label>
              <input type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} className="border rounded-lg px-2 py-2 h-9" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3 text-[10px] leading-4">
            <div className="flex flex-col">
              <label className="text-slate-500 mb-1">Lien web</label>
              <input value={webUrl} onChange={(e) => setWebUrl(e.target.value)} className="border rounded-lg px-2 py-2 h-9" />
            </div>
            <div className="flex flex-col">
              <label className="text-slate-500 mb-1">Lien vidéo</label>
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="border rounded-lg px-2 py-2 h-9" />
            </div>
          </div>
        </div>

        {/* Table mapping */}
        <div className="flex-1 overflow-auto">
          <div className="px-5 py-3 text-[10px] text-slate-500">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 font-semibold text-slate-700 mb-2">
              <div>Ingrédient importé</div>
              <div className="text-center">Choix</div>
              <div className="text-center">Qté</div>
              <div className="text-center">Unité</div>
            </div>

            {rows.map((row) => {
              const cat = row.catalogId ? ingredientCatalog.find((c) => c.id === row.catalogId) : null;

              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center border rounded-xl px-3 py-2 mb-2"
                >
                  {/* Col 1 : imported */}
                  <div className="text-[11px]">
                    <div className="font-medium text-slate-800">{row.imported.ingredient || row.imported.raw}</div>
                    <div className="text-[10px] text-slate-500">
                      Détecté : {row.imported.amount ?? "?"} {row.imported.unit || ""}
                    </div>
                  </div>

                  {/* Col 2 : choices */}
                  <div className="flex items-center gap-2">
                    <select
                      value={row.mode}
                      onChange={(e) => handleSwitchMode(row.id, e.target.value as "catalog" | "proposed")}
                      className="border rounded-lg px-2 h-8 text-[10px] bg-white"
                    >
                      <option value="catalog">Catalogue</option>
                      <option value="proposed">Ingrédient proposé</option>
                    </select>

                    {row.mode === "catalog" ? (
                      <>
                        <select
                          value={row.catalogId || ""}
                          onChange={(e) => handleSelectCatalog(row.id, e.target.value ? Number(e.target.value) : null)}
                          className="border rounded-lg px-2 h-8 text-[10px] min-w-[200px] bg-white"
                        >
                          <option value="">— choisir —</option>
                          {ingredientCatalog.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.product_name}
                            </option>
                          ))}
                        </select>
                        {cat && (
                          <span className="text-[9px] text-slate-500">
                            ({cat.kcal_100g ?? "?"} kcal/100g · P {cat.protein_100g ?? "?"} · G {cat.carbs_100g ?? "?"} · L {cat.fat_100g ?? "?"})
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={row.proposedName}
                          onChange={(e) => handleChangeProposedName(row.id, e.target.value)}
                          className="border rounded-lg px-2 h-8 text-[10px] min-w-[220px]"
                          placeholder="Nom d’ingrédient"
                        />
                        <label className="inline-flex items-center gap-1 text-[9px] text-slate-600">
                          <input
                            type="checkbox"
                            checked={row.addToCatalog}
                            onChange={() => handleToggleAddToCatalog(row.id)}
                          />
                          Ajouter au catalogue
                        </label>
                      </>
                    )}
                  </div>

                  {/* Col 3 : qté */}
                  <div className="flex items-center justify-center">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.quantity ?? ""}
                      onChange={(e) => handleChangeQty(row.id, e.target.value)}
                      className="w-24 border rounded-lg px-2 h-8 text-[10px]"
                    />
                  </div>

                  {/* Col 4 : unité */}
                  <div className="flex items-center justify-center">
                    <select
                      value={row.unitCode || ""}
                      onChange={(e) => handleChangeUnit(row.id, e.target.value)}
                      className="w-28 border rounded-lg px-2 h-8 text-[10px] bg-white"
                    >
                      <option value="">—</option>
                      {units.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-full border text-xs">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasContent}
            className="px-4 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold disabled:opacity-60"
          >
            {saving ? "Enregistrement..." : "Enregistrer ces ingrédients"}
          </button>
        </div>

        {error && (
          <div className="px-5 py-3 text-[11px] text-rose-700 bg-rose-50 border-t border-rose-100">{error}</div>
        )}
      </div>
    </div>
  );
};

export default IngredientMapperModal;