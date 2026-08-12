import { apiRequest } from "@/lib/api/client";
import { AppConfig } from "@/lib/config/environment";
import {
  CONSENT_DEFINITIONS,
  CONSENT_REGISTRY_VERSION,
  REGISTRY_CONSENT_TYPES,
  type RegistryConsentType
} from "@/lib/legal/consent-contract";

export type ConsentStatus = {
  type: RegistryConsentType;
  active: boolean;
  version: string;
  acceptedAt: string | null;
  expiresAt: string | null;
  withdrawnAt: string | null;
  scope: Record<string, unknown>;
};

export type ConsentRegistryStatus = {
  practiceId: string;
  consents: Record<RegistryConsentType, ConsentStatus>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const demoRegistries = new Map<string, ConsentRegistryStatus>();

export async function loadConsentRegistry(practiceId: string): Promise<ConsentRegistryStatus> {
  if (AppConfig.isDemoMode && practiceId.startsWith("demo-")) {
    return demoRegistries.get(practiceId) ?? emptyRegistry(practiceId);
  }
  requirePracticeId(practiceId);
  return apiRequest<ConsentRegistryStatus>(`/api/legal/consent/status?practiceId=${encodeURIComponent(practiceId)}`);
}

export async function setRegistryConsent(
  practiceId: string,
  type: RegistryConsentType,
  accepted: boolean
): Promise<ConsentRegistryStatus> {
  if (AppConfig.isDemoMode && practiceId.startsWith("demo-")) {
    const registry = demoRegistries.get(practiceId) ?? emptyRegistry(practiceId);
    const now = new Date();
    const updated: ConsentRegistryStatus = {
      ...registry,
      consents: {
        ...registry.consents,
        [type]: {
          ...registry.consents[type],
          active: accepted,
          acceptedAt: now.toISOString(),
          expiresAt: accepted
            ? new Date(now.getTime() + CONSENT_DEFINITIONS[type].validityDays * 86_400_000).toISOString()
            : null,
          withdrawnAt: accepted ? null : now.toISOString()
        }
      }
    };
    demoRegistries.set(practiceId, updated);
    return updated;
  }
  requirePracticeId(practiceId);
  return apiRequest<ConsentRegistryStatus>("/api/legal/consent", {
    method: "POST",
    body: { practiceId, type, accepted }
  });
}

export function emptyRegistry(practiceId: string): ConsentRegistryStatus {
  return {
    practiceId,
    consents: Object.fromEntries(
      REGISTRY_CONSENT_TYPES.map((type) => [
        type,
        {
          type,
          active: false,
          version: CONSENT_REGISTRY_VERSION,
          acceptedAt: null,
          expiresAt: null,
          withdrawnAt: null,
          scope: CONSENT_DEFINITIONS[type].scope
        }
      ])
    ) as Record<RegistryConsentType, ConsentStatus>
  };
}

function requirePracticeId(practiceId: string) {
  if (!UUID_RE.test(practiceId)) throw new Error("Praxis-ID für die Einwilligungsverwaltung ist ungültig.");
}
