import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";

import type { PlanId } from "@/lib/billing/plans";
import { getDemoPractice } from "@/lib/demo/demo-data";
import { clearLocalTenantCaches } from "@/lib/store/localData";
import { supabase } from "@/lib/supabase/client";

export type Practice = {
  id: string;
  name: string;
  domain?: string;
  email?: string;
  plan: PlanId;
  whiteLabelPartnerId?: string;
};

type SessionState = {
  practice: Practice | null;
  session: Session | null;
  setPractice: (practice: Practice) => void;
  setSession: (session: Session | null) => void;
  clearPractice: () => void;
  clear: () => void;
};

export const useSessionStore = create<SessionState>()((set, get) => ({
  practice: null,
  session: null,
  setPractice: (practice) => {
    const previousPracticeId = get().practice?.id;
    if (previousPracticeId && previousPracticeId !== practice.id) {
      clearLocalTenantCaches();
    }
    set({ practice });
  },
  setSession: (session) => set({ session }),
  clearPractice: () => {
    if (get().practice) {
      clearLocalTenantCaches();
    }
    set({ practice: null });
  },
  clear: () => {
    clearLocalTenantCaches();
    set({ practice: null, session: null });
  }
}));

export async function initSession() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  useSessionStore.getState().setSession(session);

  if (!session) {
    useSessionStore.getState().clear();
    return null;
  }

  const normalizedPractice = await loadAccessiblePracticeForUser(session.user.id);
  if (normalizedPractice) useSessionStore.getState().setPractice(normalizedPractice);
  else useSessionStore.getState().clearPractice();
  return normalizedPractice;
}

export async function loadAccessiblePracticeForUser(userId: string): Promise<Practice | null> {
  // B4c (E-039): Nur eine AKTIVE Praxis gewährt Zugang. Ein `draft`/`invited`
  // Eintrag (oder suspended/archived) darf nie ins Dashboard führen – der Zugang
  // entsteht erst nach Einlösung eines Admin-Aktivierungscodes.
  const { data: owned, error: ownerError } = await supabase.from("practices")
    .select("id,name,domain,email,plan,white_label_partner_id").eq("owner_id", userId).eq("onboarding_status", "active").maybeSingle();
  if (ownerError) throw ownerError;
  const ownedPractice = normalizePractice(owned);
  if (ownedPractice) return ownedPractice;

  const { data: memberships, error: membershipError } = await supabase.from("practice_memberships")
    .select("practice_id").eq("user_id", userId).eq("status", "active").order("granted_at", { ascending: false }).limit(1);
  if (membershipError) throw membershipError;
  const practiceId = memberships?.[0]?.practice_id;
  if (!practiceId) return null;
  const { data: memberPractice, error: practiceError } = await supabase.from("practices")
    .select("id,name,domain,email,plan,white_label_partner_id").eq("id", practiceId).eq("onboarding_status", "active").maybeSingle();
  if (practiceError) throw practiceError;
  return normalizePractice(memberPractice);
}

export function initDemoSession() {
  const practice = getDemoPractice();
  useSessionStore.getState().setPractice(practice);
  return practice;
}

supabase.auth.onAuthStateChange((event, session) => {
  useSessionStore.getState().setSession(session);

  if (event === "SIGNED_OUT") {
    useSessionStore.getState().clear();
  }
});

function normalizePractice(value: unknown): Practice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  const name = typeof row.name === "string" ? row.name : "";
  const plan = row.plan === "audit" || row.plan === "monitoring" || row.plan === "compliance" ? row.plan : "free";

  if (!id || !name) return null;

  return {
    id,
    name,
    domain: typeof row.domain === "string" ? row.domain : undefined,
    email: typeof row.email === "string" ? row.email : undefined,
    plan,
    whiteLabelPartnerId: typeof row.white_label_partner_id === "string" ? row.white_label_partner_id : undefined
  };
}
