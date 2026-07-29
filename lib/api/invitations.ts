import { apiRequest, ApiError } from "@/lib/api/client";

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

// Nur eine definitiv beantwortete, terminale Client-Anfrage beendet den
// Versuch. Bei Timeout, Netzwerkfehler, 429 oder 5xx bleiben die IDs stabil:
// Der Server könnte bereits erfolgreich mutiert haben, bevor die Antwort
// verloren ging, und muss dann denselben Idempotenz-Key erneut sehen.
export function shouldResetRedeemAttempt(error: unknown) {
  return error instanceof ApiError && [400, 401, 403, 409, 410].includes(error.status);
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
