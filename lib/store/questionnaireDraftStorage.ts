import * as SecureStore from "expo-secure-store";

import {
  DEFAULT_QUESTIONNAIRE_ANSWERS,
  type QuestionnaireAnswerKey,
  type QuestionnaireAnswers
} from "@/lib/security/questionnaire";
import type { AssessmentProfile } from "@/lib/security/scoring";

const NAMESPACE = "praxisshield-questionnaire-draft";
const MANIFEST_VERSION = 1;
const CHUNK_LENGTH = 500;
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

type DraftManifest = {
  version: typeof MANIFEST_VERSION;
  generation: string;
  chunkCount: number;
};

type DraftRegistry = {
  version: typeof MANIFEST_VERSION;
  generations: DraftManifest[];
};

export type QuestionnaireDraft = {
  version: typeof MANIFEST_VERSION;
  practiceId: string;
  answers: QuestionnaireAnswers;
  answeredKeys: QuestionnaireAnswerKey[];
  assessmentProfile: AssessmentProfile;
  sectionId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

const writeQueues = new Map<string, Promise<unknown>>();

export async function loadQuestionnaireDraft(practiceId: string): Promise<QuestionnaireDraft | null> {
  if (!(await secureStoreAvailable())) return null;

  const manifest = parseManifest(await SecureStore.getItemAsync(manifestKey(practiceId), options()));
  if (!manifest) return null;

  const draft = await readDraftGeneration(practiceId, manifest);
  if (!draft) {
    await deleteGeneration(practiceId, manifest);
    await SecureStore.deleteItemAsync(manifestKey(practiceId), options());
    return null;
  }

  if (Date.parse(draft.expiresAt) <= Date.now()) {
    await deleteQuestionnaireDraft(practiceId);
    return null;
  }
  return draft;
}

export async function saveQuestionnaireDraft(
  practiceId: string,
  answers: QuestionnaireAnswers,
  sectionId?: string,
  answeredKeys: QuestionnaireAnswerKey[] = [],
  assessmentProfile: AssessmentProfile = "general"
): Promise<boolean> {
  return enqueueWrite(practiceId, async () => {
    if (!(await secureStoreAvailable())) return false;

    const previous = parseManifest(await SecureStore.getItemAsync(manifestKey(practiceId), options()));
    // Do not call the public loader from inside the write queue: an expired
    // draft would enqueue deleteQuestionnaireDraft behind this save and deadlock.
    const previousDraft = previous ? await readDraftGeneration(practiceId, previous) : null;
    const now = new Date();
    const generation = `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
    const draft: QuestionnaireDraft = {
      version: MANIFEST_VERSION,
      practiceId,
      answers: sanitizeAnswers(answers),
      answeredKeys: sanitizeAnsweredKeys(answeredKeys),
      assessmentProfile: sanitizeAssessmentProfile(assessmentProfile),
      sectionId: sanitizeSectionId(sectionId),
      createdAt: previousDraft?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + RETENTION_MS).toISOString()
    };
    const chunks = split(JSON.stringify(draft));
    const nextManifest: DraftManifest = { version: MANIFEST_VERSION, generation, chunkCount: chunks.length };
    const registry = parseRegistry(await SecureStore.getItemAsync(registryKey(practiceId), options()));
    const knownGenerations = uniqueManifests([
      ...registry.generations,
      ...(previous ? [previous] : []),
      nextManifest
    ]);

    // Registry first: a crash before the manifest switch remains discoverable
    // and can be swept by the next save/delete operation.
    await SecureStore.setItemAsync(
      registryKey(practiceId),
      JSON.stringify({ version: MANIFEST_VERSION, generations: knownGenerations } satisfies DraftRegistry),
      options()
    );
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(chunkKey(practiceId, generation, index), chunk, options())
      )
    );
    await SecureStore.setItemAsync(manifestKey(practiceId), JSON.stringify(nextManifest), options());
    await Promise.all(
      knownGenerations
        .filter((manifest) => manifest.generation !== generation)
        .map((manifest) => deleteGeneration(practiceId, manifest))
    );
    await SecureStore.setItemAsync(
      registryKey(practiceId),
      JSON.stringify({ version: MANIFEST_VERSION, generations: [nextManifest] } satisfies DraftRegistry),
      options()
    );
    return true;
  });
}

export async function deleteQuestionnaireDraft(practiceId: string): Promise<void> {
  await enqueueWrite(practiceId, async () => {
    if (!(await secureStoreAvailable())) return;
    const manifest = parseManifest(await SecureStore.getItemAsync(manifestKey(practiceId), options()));
    const registry = parseRegistry(await SecureStore.getItemAsync(registryKey(practiceId), options()));
    const generations = uniqueManifests([
      ...registry.generations,
      ...(manifest ? [manifest] : [])
    ]);
    await Promise.all(generations.map((entry) => deleteGeneration(practiceId, entry)));
    await SecureStore.deleteItemAsync(manifestKey(practiceId), options());
    await SecureStore.deleteItemAsync(registryKey(practiceId), options());
  });
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

function registryKey(practiceId: string) {
  return `${NAMESPACE}.${safeKey(practiceId)}.generations`;
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

async function readDraftGeneration(
  practiceId: string,
  manifest: DraftManifest
): Promise<QuestionnaireDraft | null> {
  const chunks = await Promise.all(
    Array.from({ length: manifest.chunkCount }, (_, index) =>
      SecureStore.getItemAsync(chunkKey(practiceId, manifest.generation, index), options())
    )
  );
  if (chunks.some((chunk) => chunk === null)) return null;
  return parseDraft(chunks.join(""), practiceId);
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

function parseRegistry(value: string | null): DraftRegistry {
  if (!value) return { version: MANIFEST_VERSION, generations: [] };
  try {
    const candidate = JSON.parse(value) as Partial<DraftRegistry>;
    if (candidate.version !== MANIFEST_VERSION || !Array.isArray(candidate.generations)) {
      return { version: MANIFEST_VERSION, generations: [] };
    }
    return {
      version: MANIFEST_VERSION,
      generations: candidate.generations
        .map((entry) => parseManifest(JSON.stringify(entry)))
        .filter((entry): entry is DraftManifest => entry !== null)
    };
  } catch {
    return { version: MANIFEST_VERSION, generations: [] };
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
    const answers = sanitizeAnswers(candidate.answers as QuestionnaireAnswers);
    return {
      version: MANIFEST_VERSION,
      practiceId,
      answers,
      // Migration alter Drafts: Vor W4a gab es keine answeredKeys. Eindeutige
      // Ja/Nein-Werte gelten als bearbeitet; alte null-Werte bleiben unbekannt,
      // weil "nicht beantwortet" und "Weiß ich nicht" damals ununterscheidbar waren.
      answeredKeys: Array.isArray(candidate.answeredKeys)
        ? sanitizeAnsweredKeys(candidate.answeredKeys)
        : inferAnsweredKeys(answers),
      assessmentProfile: sanitizeAssessmentProfile(candidate.assessmentProfile),
      sectionId: sanitizeSectionId(candidate.sectionId),
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      expiresAt: candidate.expiresAt
    };
  } catch {
    return null;
  }
}

function inferAnsweredKeys(answers: QuestionnaireAnswers): QuestionnaireAnswerKey[] {
  return (Object.keys(answers) as QuestionnaireAnswerKey[]).filter((key) => answers[key] !== null);
}

function sanitizeAnsweredKeys(value: unknown): QuestionnaireAnswerKey[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(Object.keys(DEFAULT_QUESTIONNAIRE_ANSWERS) as QuestionnaireAnswerKey[]);
  return Array.from(new Set(value.filter((key): key is QuestionnaireAnswerKey => typeof key === "string" && allowed.has(key as QuestionnaireAnswerKey))));
}

function sanitizeAssessmentProfile(value: unknown): AssessmentProfile {
  return value === "health" ? "health" : "general";
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

function uniqueManifests(manifests: DraftManifest[]): DraftManifest[] {
  return Array.from(new Map(manifests.map((manifest) => [manifest.generation, manifest])).values());
}

function enqueueWrite<T>(practiceId: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(practiceId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  writeQueues.set(practiceId, next);
  void next.then(
    () => {
      if (writeQueues.get(practiceId) === next) writeQueues.delete(practiceId);
    },
    () => {
      if (writeQueues.get(practiceId) === next) writeQueues.delete(practiceId);
    }
  );
  return next;
}
