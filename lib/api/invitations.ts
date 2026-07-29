import { apiRequest } from "@/lib/api/client";

export type RedeemInvitationResult = {
  ok: true;
  practice_id: string;
  membership_id: string;
  role: string;
  status: "active";
};

export type RedeemIds = { idempotencyKey: string; requestId: string };

// Idempotenz-Identifier müssen nur pro Versuch eindeutig und über Retries hinweg
// stabil sein, nicht kryptografisch zufällig. Hermes garantiert kein
// crypto.randomUUID, daher aus Zeit + Entropie abgeleitet.
export function newRedeemIds(): RedeemIds {
  const token = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return { idempotencyKey: token(), requestId: token() };
}

// Löst einen Einladungs-Einmalcode über den serverseitig autorisierten Worker
// ein. Der Klartextcode geht nur an den Worker (dort HMAC-Prüfung); die
// Session-Identität wird automatisch über das Supabase-Token gebunden.
export async function redeemInvitation(code: string, ids: RedeemIds): Promise<RedeemInvitationResult> {
  return apiRequest<RedeemInvitationResult>("/api/invitations/redeem", {
    method: "POST",
    body: { code },
    headers: { "Idempotency-Key": ids.idempotencyKey, "X-Request-Id": ids.requestId }
  });
}
