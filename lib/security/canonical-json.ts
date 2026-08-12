/**
 * Converts a JSON-compatible value into the stable representation hashed by
 * PraxisShield manifests.
 *
 * Numeric rules intentionally follow ECMAScript JSON serialization:
 * - only finite numbers are accepted;
 * - negative zero is normalized to zero;
 * - integer, decimal and exponent formatting is produced by JSON.stringify;
 * - values outside JavaScript's exactly representable integer range must be
 *   supplied as strings by their domain contract, never as numbers.
 *
 * Object keys are sorted recursively and undefined object properties are
 * omitted to match JSON.stringify. Arrays retain their order and may not
 * contain undefined or any other non-JSON value.
 */
export function canonicalizeJsonForHash(value: unknown): unknown {
  return canonicalize(value, new WeakSet<object>(), false);
}

function canonicalize(value: unknown, ancestors: WeakSet<object>, objectProperty: boolean): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical_json_non_finite_number");
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new Error("canonical_json_unsafe_integer");
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (value === undefined && objectProperty) return undefined;
  if (typeof value !== "object" || value === undefined) {
    throw new Error("canonical_json_unsupported_value");
  }

  if (ancestors.has(value)) throw new Error("canonical_json_cycle");
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((entry) => {
        const normalized = canonicalize(entry, ancestors, false);
        if (normalized === undefined) throw new Error("canonical_json_unsupported_value");
        return normalized;
      });
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("canonical_json_unsupported_value");
    }

    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const normalized = canonicalize(record[key], ancestors, true);
      if (normalized !== undefined) result[key] = normalized;
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}
