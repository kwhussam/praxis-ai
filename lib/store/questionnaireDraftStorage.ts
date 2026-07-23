import * as SecureStore from "expo-secure-store";

import {
  DEFAULT_QUESTIONNAIRE_ANSWERS,
  type QuestionnaireAnswerKey,
  type QuestionnaireAnswers
} from "@/lib/security/questionnaire";

const NAMESPACE = "praxisshield-questionnaire-draft";
const MANIFEST_VERSION = 1;
const CHUNK_LENGTH = 500;
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

type DraftManifest = {
  version: typeof MANIFEST_VERSION;
  generation: string;
  chunkCount: number;
};

export type QuestionnaireDraft = {
  version: typeof MANIFEST_VERSION;
  practiceId: string;
  answers: QuestionnaireAnswers;
  sectionId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export async function loadQuestionnaireDraft(practiceId: string): Promise<QuestionnaireDraft | null> {
  if (!(await secureStoreAvailable())) return null;

  const manifest = parseManifest(await SecureStore.getItemAsync(manifestKey(practiceId), options()));
  if (!manifest) return null;

  const chunks = await Promise.all(
    Array.from({ length: manifest.chunkCount }, (_, index) =>
      SecureStore.getItemAsync(chunkKey(practiceId, manifest.generation, index), options())
    )
  );
  if (chunks.some((chunk) => chunk === null)) {
    await deleteGeneration(practiceId, manifest);
    await SecureStore.deleteItemAsync(manifestKey(practiceId), options());
    return null;
  }

  const draft = parseDraft(chunks.join(""), practiceId);
  if (!draft || Date.parse(draft.expiresAt) <= Date.now()) {
    await deleteQuestionnaireDraft(practiceId);
    return null;
  }
  return draft;
}

export async function saveQuestionnaireDraft(
  practiceId: string,
  answers: QuestionnaireAnswers,
  sectionId?: string
): Promise<boolean> {
  if (!(await secureStoreAvailable())) return false;

  const previous = parseManifest(await SecureStore.getItemAsync(manifestKey(practiceId), options()));
  const previousDraft = previous ? await loadQuestionnaireDraft(practiceId) : null;
  const now = new Date();
  const generation = `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
  const draft: QuestionnaireDraft = {
    version: MANIFEST_VERSION,
    practiceId,
    answers: sanitizeAnswers(answers),
    sectionId: sanitizeSectionId(sectionId),
    createdAt: previousDraft?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RETENTION_MS).toISOString()
  };
  const chunks = split(JSON.stringify(draft));
  const nextManifest: DraftManifest = { version: MANIFEST_VERSION, generation, chunkCount: chunks.length };

  await Promise.all(
    chunks.map((chunk, index) =>
      SecureStore.setItemAsync(chunkKey(practiceId, generation, index), chunk, options())
    )
  );
  await SecureStore.setItemAsync(manifestKey(practiceId), JSON.stringify(nextManifest), options());
  if (previous) await deleteGeneration(practiceId, previous);
  return true;
}

export async function deleteQuestionnaireDraft(practiceId: string): Promise<void> {
  if (!(await secureStoreAvailable())) return;
  const manifest = parseManifest(await SecureStore.getItemAsync(manifestKey(practiceId), options()));
  if (manifest) await deleteGeneration(practiceId, manifest);
  await SecureStore.deleteItemAsync(manifestKey(practiceId), options());
}

function options() {
  return {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    keychainService: NAMESPACE
  };
}

async function secureStoreAvailable() {
  return SecureStore.isAvailableAsync().catch(() => false);
}

function manifestKey(practiceId: string) {
  return `${NAMESPACE}.${safeKey(practiceId)}.manifest`;
}

function chunkKey(practiceId: string, generation: string, index: number) {
  return `${NAMESPACE}.${safeKey(practiceId)}.${safeKey(generation)}.${index}`;
}

async function deleteGeneration(practiceId: string, manifest: DraftManifest) {
  await Promise.all(
    Array.from({ length: manifest.chunkCount }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(practiceId, manifest.generation, index), options())
    )
  );
}

function parseManifest(value: string | null): DraftManifest | null {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value) as Partial<DraftManifest>;
    if (
      candidate.version !== MANIFEST_VERSION ||
      typeof candidate.generation !== "string" ||
      !Number.isSafeInteger(candidate.chunkCount) ||
      (candidate.chunkCount ?? 0) < 1 ||
      (candidate.chunkCount ?? 0) > 128
    ) {
      return null;
    }
    return candidate as DraftManifest;
  } catch {
    return null;
  }
}

function parseDraft(value: string, practiceId: string): QuestionnaireDraft | null {
  try {
    const candidate = JSON.parse(value) as Partial<QuestionnaireDraft>;
    if (
      candidate.version !== MANIFEST_VERSION ||
      candidate.practiceId !== practiceId ||
      typeof candidate.createdAt !== "string" ||
      typeof candidate.updatedAt !== "string" ||
      typeof candidate.expiresAt !== "string" ||
      !candidate.answers ||
      typeof candidate.answers !== "object"
    ) {
      return null;
    }
    return {
      version: MANIFEST_VERSION,
      practiceId,
      answers: sanitizeAnswers(candidate.answers as QuestionnaireAnswers),
      sectionId: sanitizeSectionId(candidate.sectionId),
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      expiresAt: candidate.expiresAt
    };
  } catch {
    return null;
  }
}

function sanitizeAnswers(answers: QuestionnaireAnswers): QuestionnaireAnswers {
  return (Object.keys(DEFAULT_QUESTIONNAIRE_ANSWERS) as QuestionnaireAnswerKey[]).reduce<QuestionnaireAnswers>(
    (result, key) => {
      const value = answers[key];
      result[key] = value === true || value === false ? value : null;
      return result;
    },
    { ...DEFAULT_QUESTIONNAIRE_ANSWERS }
  );
}

function sanitizeSectionId(value?: string) {
  return typeof value === "string" && /^[a-z0-9_-]{1,64}$/.test(value) ? value : undefined;
}

function split(value: string) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += CHUNK_LENGTH) {
    chunks.push(value.slice(index, index + CHUNK_LENGTH));
  }
  return chunks.length > 0 ? chunks : [""];
}

function safeKey(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
}
