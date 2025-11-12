// =============================================
// File: src/components/CalendarPage.tsx (n'affiche que les présents)
// =============================================
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import CalendarQuickFill from "./CalendarQuickFill";

export type Household = { id: string; name: string };
export type PersonRow = { id: string; household_id: string; display_name: string; appetite_coeff: number | null; is_active: boolean | null };

export type MealTypeRow = { id: string; code: string; label: string | null; base_coeff: number | null };

export type PresenceRow = {
  id?: string;
  household_id: string;
  date: string; // YYYY-MM-DD
  meal_type_id: string;
  person_id: string;
  regime: string | null;
  coef: number | null;
  present: boolean;
};

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // lundi
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function monthStart(d: Date): Date { const c = new Date(d.getFullYear(), d.getMonth(), 1); c.setHours(0,0,0,0); return c; }
function monthEnd(d: Date): Date { const c = new Date(d.getFullYear(), d.getMonth()+1, 0); c.setHours(0,0,0,0); return c; }

export default function CalendarPage({ household, persons, canEdit }: { household: Household; persons: PersonRow[]; canEdit: boolean; }) {
  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [mealTypes, setMealTypes] = useState<MealTypeRow[]>([]);
  const [rows, setRows] = useState<PresenceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const personsMap = useMemo(() => {
    const m = new Map<string, PersonRow>();
    persons.forEach((p) => m.set(p.id, p));
    return m;
  }, [persons]);

  const range = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(anchor);
      const end = addDays(start, 6);
      return { start, end };
    }
    const start = monthStart(anchor);
    const end = monthEnd(anchor);
    return { start, end };
  }, [anchor, mode]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true); setError(null);
      try {
        const { data: mt, error: e1 } = await supabase
          .from("meal_types")
          .select("id, code, label, base_coeff")
          .eq("household_id", household.id)
          .order("code", { ascending: true });
        if (e1) throw e1;
        setMealTypes((mt || []) as MealTypeRow[]);

        const { data: pr, error: e2 } = await supabase
          .from("meal_presence")
          .select("id, household_id, date, meal_type_id, person_id, regime, coef, present")
          .eq("household_id", household.id)
          .gte("date", formatDateOnly(range.start))
          .lte("date", formatDateOnly(range.end))
          .eq("present", true); // ⚠️ on ne ramène que les présents
        if (e2) throw e2;
        setRows((pr || []) as PresenceRow[]);
      } catch (e: any) {
        console.error(e);
        setError("Impossible de charger le calendrier.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [household.id, range.start, range.end, mode]);

  const days = useMemo(() => {
    const list: Date[] = [];
    if (mode === "week") { for (let i = 0; i < 7; i++) list.push(addDays(range.start, i)); }
    else {
      const start = monthStart(anchor); const end = monthEnd(anchor);
      const padStart = (start.getDay() + 6) % 7; const totalDays = padStart + end.getDate();
      const totalCells = Math.ceil(totalDays / 7) * 7; const gridStart = addDays(start, -padStart);
      for (let i = 0; i < totalCells; i++) list.push(addDays(gridStart, i));
    }
    return list;
  }, [anchor, mode, range.start]);

  const entriesByDayMeal = useMemo(() => {
    const map = new Map<string, PresenceRow[]>();
    for (const r of rows) {
      const key = `${r.date}|${r.meal_type_id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [rows]);

  const toggleToAbsent = async (row: PresenceRow) => {
    if (!canEdit) return;
    try {
      const { error } = await supabase
        .from("meal_presence")
        .upsert({
          household_id: row.household_id,
          date: row.date,
          meal_type_id: row.meal_type_id,
          person_id: row.person_id,
          present: false,
        }, { onConflict: "household_id,date,meal_type_id,person_id" });
      if (error) throw error;
      setRows((prev) => prev.filter((r) => !(r.date === row.date && r.meal_type_id === row.meal_type_id && r.person_id === row.person_id)));
    } catch (e) {
      console.error(e);
      setError("Impossible de mettre à jour la présence.");
    }
  };

  const dayHeader = (d: Date) => {
    const wd = d.toLocaleDateString(undefined, { weekday: "short" });
    const day = d.getDate();
    const isToday = formatDateOnly(d) === formatDateOnly(new Date());
    return (
      <div className="flex items-center justify-between">
        <span className={`text-xs ${isToday ? "text-emerald-700" : "text-slate-500"}`}>{wd}</span>
        <span className={`text-sm font-semibold ${isToday ? "text-emerald-700" : "text-slate-700"}`}>{day}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded-lg border hover:bg-slate-50" onClick={() => setAnchor((d) => (mode === "week" ? addDays(d, -7) : new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())))} title="Précédent">◀</button>
          <div className="px-3 py-2 rounded-lg border bg-white text-sm">
            {mode === "week" ? (
              <span>Semaine du {range.start.toLocaleDateString()} au {range.end.toLocaleDateString()}</span>
            ) : (
              <span>{anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            )}
          </div>
          <button className="px-2 py-1 rounded-lg border hover:bg-slate-50" onClick={() => setAnchor((d) => (mode === "week" ? addDays(d, 7) : new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())))} title="Suivant">▶</button>
          <button className="px-3 py-2 rounded-lg border text-xs hover:bg-slate-50" onClick={() => setAnchor(new Date())}>Aujourd'hui</button>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-white border rounded-lg p-1 flex">
            <button className={`px-3 py-1 rounded-md text-xs ${mode === "week" ? "bg-emerald-600 text-white" : "text-slate-700"}`} onClick={() => setMode("week")}>Semaine</button>
            <button className={`px-3 py-1 rounded-md text-xs ${mode === "month" ? "bg-emerald-600 text-white" : "text-slate-700"}`} onClick={() => setMode("month")}>Mois</button>
          </div>
          {canEdit && (
            <CalendarQuickFill
              household={household}
              persons={persons}
              mealTypes={mealTypes}
              onDone={() => setAnchor((d) => new Date(d))}
            />
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Vue Semaine : n'affiche que les présents */}
      {mode === "week" && (
        <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-8 border-b bg-slate-50 text-xs text-slate-600">
            <div className="p-2 font-medium">Repas</div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="p-2 border-l">{dayHeader(addDays(range.start, i))}</div>
            ))}
          </div>

          {mealTypes.map((meal) => (
            <div key={meal.id} className="grid grid-cols-8">
              <div className="p-2 text-xs font-semibold bg-slate-50 border-t">{meal.code}</div>
              {Array.from({ length: 7 }).map((_, i) => {
                const d = addDays(range.start, i);
                const key = `${formatDateOnly(d)}|${meal.id}`;
                const list = (entriesByDayMeal.get(key) || []).filter((r) => r.present);
                return (
                  <div key={i} className="p-2 border-t border-l min-h-[88px]">
                    {loading ? (
                      <div className="text-xs text-slate-400">…</div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {list.map((r) => {
                          const p = personsMap.get(r.person_id);
                          const label = p?.display_name || r.person_id.substring(0, 6);
                          return (
                            <button
                              key={r.person_id}
                              onClick={() => toggleToAbsent(r)}
                              disabled={!canEdit}
                              className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700"
                              title="Cliquer pour marquer absent"
                            >
                              {label} ×
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Vue Mois (compacte) */}
      {mode === "month" && (
        <div className="grid grid-cols-7 gap-2">
          {days.map((d, idx) => {
            const inMonth = d.getMonth() === anchor.getMonth();
            const dKey = formatDateOnly(d);
            return (
              <div key={idx} className={`rounded-xl border p-2 bg-white min-h-[120px] ${inMonth ? "opacity-100" : "opacity-60"}`}>
                {dayHeader(d)}
                <div className="mt-1 space-y-1">
                  {mealTypes.map((meal) => {
                    const list = rows.filter((r) => r.date === dKey && r.meal_type_id === meal.id && r.present);
                    return (
                      <div key={meal.id}>
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">{meal.code}</div>
                        <div className="flex flex-wrap gap-1">
                          {list.map((r) => {
                            const p = personsMap.get(r.person_id);
                            const label = p?.display_name || r.person_id.substring(0, 6);
                            return (
                              <button
                                key={r.person_id}
                                onClick={() => toggleToAbsent(r)}
                                disabled={!canEdit}
                                className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700"
                              >
                                {label} ×
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}