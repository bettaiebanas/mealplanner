// =============================================
// File: src/App.tsx (Calendrier branché sur persons + meal_presence/meal_types)
// =============================================
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import HouseholdSettings from "./components/HouseholdSettings";
import RecipesPage from "./components/RecipesPage";
import CalendarPage from "./components/CalendarPage";

// --- Types ---
type SupaSession = any;

export type Household = { id: string; name: string };

export type MemberRow = {
  household_id: string;
  user_id: string;
  role: string;
  users?: { email: string | null } | { email: string | null }[] | null;
};

export type PersonRow = {
  id: string;
  household_id: string;
  display_name: string;
  appetite_coeff: number | null;
  is_active: boolean | null;
};

// 👉 Ajout de la nouvelle vue "calendar"
 type ActiveView = "dashboard" | "recipes" | "settings" | "calendar";

function App() {
  const [session, setSession] = useState<SupaSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [households, setHouseholds] = useState<Household[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]); // pour les paramètres existants
  const [persons, setPersons] = useState<PersonRow[]>([]); // ⚠️ utilisé par le calendrier

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [addMemberEmail, setAddMemberEmail] = useState("");

  const [activeView, setActiveView] = useState<ActiveView>("dashboard");

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setGlobalError(null);

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      setSession(currentSession ?? null);

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession ?? null);
      });

      setLoading(false);
      return () => subscription.unsubscribe();
    };

    init();
  }, []);

  useEffect(() => {
    const loadForUser = async () => {
      if (!session?.user) {
        setHouseholds([]);
        setMembers([]);
        setPersons([]);
        setActiveHouseholdId(null);
        setActiveView("dashboard");
        return;
      }

      setLoading(true);
      setGlobalError(null);

      const { data: hData, error: hError } = await supabase
        .from("households")
        .select("id, name")
        .order("created_at", { ascending: true });

      if (hError) {
        setGlobalError("Impossible de charger vos foyers.");
        setLoading(false);
        return;
      }

      const list = (hData || []) as Household[];
      setHouseholds(list);

      if (list.length === 0) {
        setMembers([]);
        setPersons([]);
        setActiveHouseholdId(null);
        setActiveView("dashboard");
        setLoading(false);
        return;
      }

      const chosenId = activeHouseholdId || list[0].id;
      setActiveHouseholdId(chosenId);

      await Promise.all([loadMembers(chosenId), loadPersons(chosenId)]);
      setLoading(false);
    };

    loadForUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const loadMembers = async (householdId: string) => {
    setGlobalError(null);
    const { data, error } = await supabase
      .from("household_members")
      .select("household_id, user_id, role, users(email)")
      .eq("household_id", householdId)
      .order("created_at", { ascending: true });
    if (error) {
      setGlobalError("Impossible de charger les membres du foyer.");
      setMembers([]);
      return;
    }
    setMembers((data || []) as MemberRow[]);
  };

  const loadPersons = async (householdId: string) => {
    const { data, error } = await supabase
      .from("persons")
      .select("id, household_id, display_name, appetite_coeff, is_active")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (error) {
      console.error(error);
      setPersons([]);
      return;
    }
    setPersons((data || []) as PersonRow[]);
  };

  const activeHousehold: Household | null =
    households.find((h) => h.id === activeHouseholdId) || null;

  const currentUserRole =
    members.find((m) => m.user_id === session?.user?.id)?.role || null;

  const canManageMembers = !!currentUserRole && ["owner", "editor"].includes(currentUserRole);

  const canEditRecipes = canManageMembers;
  const canEditCalendar = canManageMembers; // mêmes droits

  const isOwner = currentUserRole === "owner";

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setHouseholds([]);
    setMembers([]);
    setPersons([]);
    setActiveHouseholdId(null);
    setActiveView("dashboard");
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHousehold || !isOwner) return;

    const email = addMemberEmail.trim().toLowerCase();
    if (!email) return;

    setGlobalError(null);

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (userError) {
      setGlobalError("Impossible de vérifier l'utilisateur.");
      return;
    }
    if (!user) {
      setGlobalError("Email inconnu. Demandez-lui de se connecter une première fois.");
      return;
    }
    if (members.find((m) => m.user_id === user.id)) {
      setGlobalError("Déjà membre de ce foyer.");
      return;
    }

    const { error: insertError } = await supabase
      .from("household_members")
      .insert({ household_id: activeHousehold.id, user_id: user.id, role: "editor" });

    if (insertError) {
      setGlobalError("Impossible d'ajouter ce membre.");
      return;
    }

    setAddMemberEmail("");
    await loadMembers(activeHousehold.id);
  };

  if (loading && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-500">Chargement…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <button
          onClick={signInWithGoogle}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium shadow hover:bg-emerald-700 transition"
        >
          Se connecter avec Google
        </button>
      </div>
    );
  }

  if (!loading && session && households.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <h1 className="text-2xl font-semibold mb-3 text-slate-800">Accès en attente</h1>
        <p className="text-slate-600 max-w-xl text-center">Votre compte est connecté, mais vous n'êtes membre d'aucun foyer.</p>
        <button onClick={signOut} className="mt-6 px-3 py-2 rounded-md border text-sm text-slate-600 hover:bg-slate-100">Se déconnecter</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-white">
        <div className="font-semibold text-slate-800">MealPlanner</div>

        <div className="flex items-center gap-4">
          {activeHousehold && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase text-slate-400">Foyer actif</span>
              <span className="text-xs font-semibold text-slate-700">{activeHousehold.name}</span>
            </div>
          )}

          {activeHousehold && (
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => setActiveView("dashboard")}
                className={`px-3 py-1 rounded-full border ${activeView === "dashboard" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-200 hover:bg-emerald-50"}`}
              >
                Tableau de bord
              </button>
              <button
                onClick={() => setActiveView("calendar")}
                className={`px-3 py-1 rounded-full border ${activeView === "calendar" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-200 hover:bg-emerald-50"}`}
              >
                Calendrier
              </button>
              <button
                onClick={() => setActiveView("recipes")}
                className={`px-3 py-1 rounded-full border ${activeView === "recipes" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-200 hover:bg-emerald-50"}`}
              >
                Gestion des recettes
              </button>
              <button
                onClick={() => setActiveView("settings")}
                className={`px-3 py-1 rounded-full border ${activeView === "settings" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-200 hover:bg-emerald-50"}`}
              >
                Paramètres du foyer
              </button>
            </div>
          )}

          <span className="text-sm text-slate-600">{session.user?.email}</span>
          <button onClick={signOut} className="px-3 py-1 rounded-md border text-xs text-slate-600 hover:bg-slate-100">Déconnexion</button>
        </div>
      </header>

      {/* Contenu */}
      <main className="max-w-6xl mx-auto p-6 space-y-8">
        {activeView === "dashboard" && <></>}

        {/* 👉 Page Calendrier basée sur persons */}
        {activeView === "calendar" && activeHousehold && (
          <section className="mt-2">
            <h1 className="text-2xl font-semibold mb-3 text-slate-800">Calendrier des présences</h1>
            <p className="text-slate-600 mb-4 text-sm">
              Planning des repas pour <span className="font-semibold">{activeHousehold.name}</span>.
            </p>
            <CalendarPage household={activeHousehold} persons={persons} canEdit={canEditCalendar} />
          </section>
        )}

        {activeView === "recipes" && activeHousehold && (
          <section className="mt-2">
            <h1 className="text-2xl font-semibold mb-3 text-slate-800">Gestion des recettes</h1>
            <p className="text-slate-600 mb-4 text-sm">Catalogue des recettes pour <span className="font-semibold">{activeHousehold.name}</span>.</p>
            <RecipesPage household={activeHousehold} canEdit={canEditRecipes} />
          </section>
        )}

        {activeView === "settings" && activeHousehold && (
          <section className="mt-2 space-y-6">
            {/* Reste de ta page Paramètres existante */}
            <HouseholdSettings household={activeHousehold} canEdit={canManageMembers} />
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
