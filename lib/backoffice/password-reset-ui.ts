import type { BackofficeMembership, PracticeMemberRole } from "@/lib/backoffice/types";

// Ein auswählbares Reset-Ziel. `role === null` markiert den Praxis-Inhaber, der
// (noch) keine Membership-Zeile hat — das Backend akzeptiert dessen owner_id
// dennoch als Ziel.
export type ResetTarget = { userId: string; role: PracticeMemberRole | null };

// Leitet die Zielauswahl aus owner_id + Mitgliedschaften ab. Aktive Mitglieder
// bleiben in ihrer Reihenfolge; der Inhaber wird nur dann zusätzlich (vorne)
// aufgeführt, wenn er nicht ohnehin schon eine aktive Membership hat — so wird
// er nie doppelt gezeigt, aber auch nie unerreichbar (P1-1).
export function buildResetTargets(ownerId: string | null, memberships: BackofficeMembership[]): ResetTarget[] {
  const active = memberships.filter((member) => member.status === "active");
  const targets: ResetTarget[] = active.map((member) => ({ userId: member.user_id, role: member.role }));
  if (ownerId && !targets.some((target) => target.userId === ownerId)) {
    targets.unshift({ userId: ownerId, role: null });
  }
  return targets;
}

// Entscheidet, ob ein neuer Idempotenz-Key erzeugt werden muss. Ein bewusster
// „Neuen Code erzeugen"-Klick (forceNew) und der erste Versuch eines Ziels
// rotieren; ein gewöhnlicher Retry desselben Ziels behält den Key und löst
// dadurch keinen zweiten Reset aus (Retry-vs.-bewusst-neuer-Code, P1-2).
export function shouldRotateResetKey(current: { fingerprint: string } | null, fingerprint: string, forceNew: boolean): boolean {
  return forceNew || current?.fingerprint !== fingerprint;
}

export type ResetOutcome = { text: string; needsStepUp: boolean; alreadyIssued: boolean };

// Bildet den HTTP-Status auf eine feste, nicht reflektierende Meldung ab; der
// rohe Serverfehler wird nie durchgereicht. 403 = fehlender/alter MFA-Step-up,
// 409 = bereits ausgelöst (kein erneuter Code ohne bewusste Neuanforderung),
// 404 = nicht gefunden/keine Berechtigung (anti-enumeration).
export function resetMessageForStatus(status: number | null): ResetOutcome {
  switch (status) {
    case 403:
      return { text: "Für diese Aktion ist eine frische MFA-Bestätigung nötig. Bitte MFA erneuern und erneut auslösen.", needsStepUp: true, alreadyIssued: false };
    case 429:
      return { text: "Zu viele Reset-Anfragen. Bitte kurz warten und erneut versuchen.", needsStepUp: false, alreadyIssued: false };
    case 409:
      return { text: "Für diese Person wurde bereits ein Reset ausgelöst; der Code wird nicht erneut angezeigt. Falls die Person keinen Code erhalten hat, über die Aktion zum Neu-Erzeugen einen neuen Code anfordern.", needsStepUp: false, alreadyIssued: true };
    case 404:
      return { text: "Nicht möglich – Praxis oder Person nicht gefunden oder keine Berechtigung.", needsStepUp: false, alreadyIssued: false };
    case 400:
      return { text: "Bitte Person und Identitätsnachweis auswählen.", needsStepUp: false, alreadyIssued: false };
    default:
      return { text: "Der Reset konnte nicht ausgelöst werden. Bitte erneut versuchen.", needsStepUp: false, alreadyIssued: false };
  }
}
