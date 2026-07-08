import type { CheckData } from "@/lib/security/scoring";

export type QuestionnaireAnswerKey =
  | "mfa"
  | "mfaEvidence"
  | "backups"
  | "backupDocumented"
  | "restoreTested"
  | "restoreTestEvidence"
  | "patching"
  | "patchingEvidence"
  | "privacyDocuments"
  | "privacyReviewEvidence"
  | "securityOwnerAssigned"
  | "responsibilityDocumented"
  | "staffTraining"
  | "dmarc";

export type QuestionnaireAnswers = Record<QuestionnaireAnswerKey, boolean>;

export type QuestionnaireQuestion = {
  key: QuestionnaireAnswerKey;
  label: string;
};

export type QuestionnaireSection = {
  title: string;
  questions: QuestionnaireQuestion[];
};

export const DEFAULT_QUESTIONNAIRE_ANSWERS: QuestionnaireAnswers = {
  mfa: false,
  mfaEvidence: false,
  backups: true,
  backupDocumented: false,
  restoreTested: false,
  restoreTestEvidence: false,
  patching: false,
  patchingEvidence: false,
  privacyDocuments: false,
  privacyReviewEvidence: false,
  securityOwnerAssigned: false,
  responsibilityDocumented: false,
  staffTraining: true,
  dmarc: false
};

export const QUESTIONNAIRE_SECTIONS: QuestionnaireSection[] = [
  {
    title: "MFA",
    questions: [
      { key: "mfa", label: "Ist MFA für alle kritischen Konten aktiviert?" },
      { key: "mfaEvidence", label: "Liegt ein MFA-Nachweis vor, z. B. Richtlinie, Screenshot oder Benutzerliste?" }
    ]
  },
  {
    title: "Backups und Restore-Tests",
    questions: [
      { key: "backups", label: "Werden Praxisdaten täglich automatisiert gesichert?" },
      { key: "backupDocumented", label: "Gibt es ein aktuelles Backup-Protokoll mit Speicherort und Aufbewahrung?" },
      { key: "restoreTested", label: "Wurde in den letzten 6 Monaten ein Restore-Test durchgeführt?" },
      { key: "restoreTestEvidence", label: "Ist der Restore-Test mit Datum, Ergebnis und Verantwortlichem dokumentiert?" }
    ]
  },
  {
    title: "Patchmanagement",
    questions: [
      { key: "patching", label: "Gibt es einen festen Patchprozess für Server, Clients und Praxissoftware?" },
      { key: "patchingEvidence", label: "Liegt ein Patch-/Update-Protokoll mit Datum und Status vor?" }
    ]
  },
  {
    title: "DSGVO-Dokumentation",
    questions: [
      { key: "privacyDocuments", label: "Sind AVV, TOMs, Verarbeitungsverzeichnis und Löschkonzept vorhanden?" },
      { key: "privacyReviewEvidence", label: "Wurden die DSGVO-Dokumente in den letzten 12 Monaten geprüft und freigegeben?" }
    ]
  },
  {
    title: "Verantwortlichkeiten",
    questions: [
      { key: "securityOwnerAssigned", label: "Ist eine verantwortliche Person für IT-Sicherheit und Datenschutz benannt?" },
      { key: "responsibilityDocumented", label: "Sind Vertretung, Aufgaben und Eskalationswege schriftlich dokumentiert?" }
    ]
  },
  {
    title: "Weitere Basisfragen",
    questions: [
      { key: "staffTraining", label: "Gab es in den letzten 12 Monaten Awareness-Schulung?" },
      { key: "dmarc", label: "Ist DMARC für die Praxisdomain aktiv?" }
    ]
  }
];

export function questionnaireAnswersToCheckData(answers: Partial<Record<string, boolean>>): CheckData {
  const hasDailyBackupEvidence = answers.backups === true && answers.backupDocumented === true;
  const hasRestoreEvidence = answers.restoreTested === true && answers.restoreTestEvidence === true;

  return {
    mfa_enabled: answers.mfa === true && answers.mfaEvidence === true,
    backup_tested: hasRestoreEvidence,
    backup_frequency: answers.backups === undefined ? undefined : hasDailyBackupEvidence ? "daily" : answers.backups ? "weekly" : "none",
    dmarc_exists: answers.dmarc,
    updates_current: answers.patching === true && answers.patchingEvidence === true,
    staff_training: answers.staffTraining,
    privacy_documents_current: answers.privacyDocuments === true && answers.privacyReviewEvidence === true,
    responsibilities_defined: answers.securityOwnerAssigned === true && answers.responsibilityDocumented === true
  };
}
