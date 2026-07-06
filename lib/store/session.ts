import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Session } from "@supabase/supabase-js";

import type { PlanId } from "@/lib/billing/plans";
import { getDemoPractice } from "@/lib/demo/demo-data";
import { createStringStorage } from "@/lib/store/storage";
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
  clear: () => void;
};

const storage = createStringStorage("praxisshield-session");

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      practice: null,
      session: null,
      setPractice: (practice) => set({ practice }),
      setSession: (session) => set({ session }),
      clear: () => set({ practice: null, session: null })
    }),
    {
      name: "session",
      storage: createJSONStorage(() => ({
        getItem: (name) => storage.getString(name) ?? null,
        setItem: (name, value) => storage.set(name, value),
        removeItem: (name) => storage.delete(name)
      }))
    }
  )
);

export async function initSession() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  useSessionStore.getState().setSession(session);

  if (!session) {
    useSessionStore.getState().clear();
    return null;
  }

  const { data: practice, error } = await supabase
    .from("practices")
    .select("id,name,domain,email,plan,white_label_partner_id")
    .eq("owner_id", session.user.id)
    .maybeSingle();

  if (error) throw error;
  const normalizedPractice = normalizePractice(practice);
  if (normalizedPractice) useSessionStore.getState().setPractice(normalizedPractice);
  return normalizedPractice;
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
