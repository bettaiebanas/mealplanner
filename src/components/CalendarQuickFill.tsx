// =============================================
// File: src/components/CalendarQuickFill.tsx (utilise persons)
// =============================================
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Household, PersonRow, MealTypeRow } from "./CalendarPage";

function formatDateOnly(d: Date): string { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${day}`; }
function addDays(d: Date, n: number): Date { const c = new Date(d); c.setDate(c.getDate() + n); return c; }

export default function CalendarQuickFill({ household, persons, mealTypes, onDone }: { household: Household; persons: PersonRow[]; mealTypes: MealTypeRow[]; onDone?: () => void; }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<string>(formatDateOnly(new Date()));
  const [end, setEnd] = useState<string>(formatDateOnly(addDays(new Date(), 10)));
  const [selectedMeals, setSelectedMeals] = useState<Record<string, boolean>>({}); // meal_type_id -> checked
  const [selectedPeople, setSelectedPeople] = useState<Record<string, boolean>>({}); // person_id -> checked
  const [regime, setRegime] = useState<string>("");
  const [coef, setCoef] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true); setError(null);
    try {
      const s = new Date(start); const e = new Date(end);
      const days: string[] = []; for (let d = new Date(s); d <= e; d = addDays(d, 1)) days.push(formatDateOnly(d));
      const mealIds = mealTypes.filter((mt) => !!selectedMeals[mt.id]).map((mt) => mt.id);
      const people = persons.map((p) => p.id).filter((id) => selectedPeople[id]);
      if (people.length === 0 || mealIds.length === 0 || days.length === 0) {
        setError("Sélectionnez au moins une personne, un repas et une date."); setSaving(false); return;
      }

      const payload: any[] = [];
      for (const d of days) {
        for (const meal_type_id of mealIds) {
          for (const person_id of people) {
            payload.push({ household_id: household.id, date: d, meal_type_id, person_id, present: true, regime: regime || null, coef: coef || 1 });
          }
        }
      }

      const { error } = await supabase
        .from("meal_presence")
        .upsert(payload, { onConflict: "household_id,date,meal_type_id,person_id" });
      if (error) throw error;

      setOpen(false); onDone?.();
    } catch (e) {
      console.error(e); setError("Enregistrement impossible.");
    } finally { setSaving(false); }
  };

  return (
    <div className="relative">
      <button className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700" onClick={() => setOpen((o) => !o)}>Remplir le planning</button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[560px] max-w-[90vw] bg-white border rounded-xl shadow-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800">Remplir en lot</h3>
            <button className="text-xs text-slate-500" onClick={() => setOpen(false)}>Fermer</button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-sm text-slate-700 flex flex-col gap-1">
              Date de début
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="px-2 py-1 rounded-md border" />
            </label>
            <label className="text-sm text-slate-700 flex flex-col gap-1">
              Date de fin
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="px-2 py-1 rounded-md border" />
            </label>
            <div className="col-span-2 flex items-center gap-4">
              {mealTypes.map((mt) => (
                <label key={mt.id} className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={!!selectedMeals[mt.id]} onChange={(e) => setSelectedMeals((prev) => ({ ...prev, [mt.id]: e.target.checked }))} />
                  {mt.code}
                </label>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Personnes</div>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-auto p-1 border rounded-md">
              {persons.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!selectedPeople[p.id]} onChange={(e) => setSelectedPeople((prev) => ({ ...prev, [p.id]: e.target.checked }))} />
                  {p.display_name}
                </label>
              ))}
              {persons.length === 0 && <div className="text-xs text-slate-400">Aucune personne</div>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-sm text-slate-700 flex flex-col gap-1">
              Régime (optionnel)
              <input type="text" placeholder="Keto, Équilibré, …" value={regime} onChange={(e) => setRegime(e.target.value)} className="px-2 py-1 rounded-md border" />
            </label>
            <label className="text-sm text-slate-700 flex flex-col gap-1">
              Coef (optionnel)
              <input type="number" step="0.1" min={0} value={coef} onChange={(e) => setCoef(parseFloat(e.target.value))} className="px-2 py-1 rounded-md border" />
            </label>
          </div>

          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <button className="px-3 py-2 rounded-md border text-xs text-slate-600 hover:bg-slate-50" onClick={() => setOpen(false)}>Annuler</button>
            <button onClick={submit} disabled={saving} className="px-3 py-2 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700">{saving ? "Enregistrement…" : "Valider"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
