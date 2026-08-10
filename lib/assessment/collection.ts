export const COLLECTION_STATUSES = [
  "collected",
  "not_checked",
  "unsupported",
  "permission_denied",
  "timeout",
  "error",
  "unavailable"
] as const;

export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];
export type EvidenceFreshness = "fresh" | "stale" | "unknown";
export const DEFAULT_CLOCK_SKEW_TOLERANCE_MS = 2 * 60 * 1000;

export type CollectionMetadata = {
  status: CollectionStatus;
  reason?: string;
  observed_at: string;
  expires_at?: string;
  freshness: EvidenceFreshness;
};

type CollectionResultBase = Omit<CollectionMetadata, "status">;

export type CollectionResult<T> =
  | (CollectionResultBase & { status: "collected"; value: T })
  | (CollectionResultBase & { status: Exclude<CollectionStatus, "collected">; value?: never });

export type CollectionTimeOptions = {
  now?: Date;
  observedAt?: Date | string;
  expiresAt?: Date | string;
  ttlMs?: number;
};

type CollectionObservationOptions = Pick<CollectionTimeOptions, "now" | "observedAt">;

export function deriveEvidenceFreshness(
  input: Pick<CollectionMetadata, "observed_at" | "expires_at">,
  now = new Date(),
  clockSkewToleranceMs = DEFAULT_CLOCK_SKEW_TOLERANCE_MS
): EvidenceFreshness {
  if (hasInvalidEvidenceWindow(input, now, clockSkewToleranceMs)) return "unknown";
  const expiresAt = input.expires_at ? Date.parse(input.expires_at) : Number.NaN;
  if (!Number.isFinite(expiresAt)) return "unknown";
  return expiresAt > now.getTime() ? "fresh" : "stale";
}

export function hasInvalidEvidenceWindow(
  input: Pick<CollectionMetadata, "observed_at" | "expires_at">,
  now = new Date(),
  clockSkewToleranceMs = DEFAULT_CLOCK_SKEW_TOLERANCE_MS
) {
  const observedAt = Date.parse(input.observed_at);
  const latestAcceptedObservation = now.getTime() + Math.max(0, clockSkewToleranceMs);
  if (!Number.isFinite(observedAt) || observedAt > latestAcceptedObservation) return true;
  if (input.expires_at === undefined) return false;
  const expiresAt = Date.parse(input.expires_at);
  return !Number.isFinite(expiresAt) || expiresAt < observedAt;
}

export function collected<T>(value: T, options: CollectionTimeOptions = {}): CollectionResult<T> {
  const timestamps = resolveTimestamps(options);
  return {
    status: "collected",
    value,
    ...timestamps,
    freshness: deriveEvidenceFreshness(timestamps, options.now)
  };
}

export function notCollected<T = never>(
  status: Exclude<CollectionStatus, "collected">,
  reason: string,
  options: CollectionObservationOptions = {}
): CollectionResult<T> {
  const timestamps = resolveTimestamps(options);
  return {
    status,
    reason,
    observed_at: timestamps.observed_at,
    freshness: "unknown"
  };
}

export function collectionMetadata<T>(result: CollectionResult<T>): CollectionMetadata {
  const { status, reason, observed_at, expires_at, freshness } = result;
  return { status, reason, observed_at, expires_at, freshness };
}

export function isCollected<T>(
  result: CollectionResult<T>
): result is CollectionResultBase & { status: "collected"; value: T } {
  return result.status === "collected";
}

export type MonitoringProviderState = "active" | "not_configured" | "unavailable" | "timeout";

export function collectionStatusForProvider(status: MonitoringProviderState): CollectionStatus {
  switch (status) {
    case "active":
      return "collected";
    case "not_configured":
      return "not_checked";
    case "unavailable":
      return "unavailable";
    case "timeout":
      return "timeout";
  }
}

function resolveTimestamps(options: CollectionTimeOptions) {
  const now = options.now ?? new Date();
  const observedAt = toDate(options.observedAt) ?? now;
  const explicitExpiry = toDate(options.expiresAt);
  const expiresAt = explicitExpiry ?? (
    options.ttlMs === undefined ? undefined : new Date(observedAt.getTime() + Math.max(0, options.ttlMs))
  );

  return {
    observed_at: observedAt.toISOString(),
    expires_at: expiresAt?.toISOString()
  };
}

function toDate(value: Date | string | undefined) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}
