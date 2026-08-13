import { collected, notCollected, type CollectionResult } from "@/lib/assessment/collection";
import type { MdnsServiceResult } from "@/lib/security/networkProbeTypes";

const MDNS_OBSERVATION_TTL_MS = 5 * 60 * 1000;

export function mdnsCollectionResult(results: MdnsServiceResult[]): CollectionResult<number> {
  if (results.length === 0) return collected(0, { ttlMs: MDNS_OBSERVATION_TTL_MS });
  if (results.every((result) => result.source === "unsupported")) {
    return notCollected("unsupported", "mDNS-Erkennung wird auf dieser Plattform nicht angeboten.");
  }

  const measured = results.filter((result) => result.source === "measured" || result.source === "inferred");
  if (measured.length > 0) return collected(measured.length, { ttlMs: MDNS_OBSERVATION_TTL_MS });

  return notCollected("unavailable", "Die mDNS-Erkennung war technisch nicht verfügbar.");
}
