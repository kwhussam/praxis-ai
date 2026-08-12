import { canonicalizeJsonForHash } from "@/lib/security/canonical-json";

describe("canonicalizeJsonForHash", () => {
  it("sortiert Objektschlüssel rekursiv und bewahrt die Array-Reihenfolge", () => {
    expect(JSON.stringify(canonicalizeJsonForHash({ z: 1, a: { y: 2, x: [3, 1] } }))).toBe(
      '{"a":{"x":[3,1],"y":2},"z":1}'
    );
  });

  it("normalisiert negative Null und nutzt die JSON-Zahlendarstellung", () => {
    expect(JSON.stringify(canonicalizeJsonForHash({ negativeZero: -0, decimal: 1.25, exponent: 1e-7 }))).toBe(
      '{"decimal":1.25,"exponent":1e-7,"negativeZero":0}'
    );
  });

  it("lehnt nicht exakt darstellbare Ganzzahlen ab", () => {
    expect(() => canonicalizeJsonForHash(Number.MAX_SAFE_INTEGER + 1)).toThrow("canonical_json_unsafe_integer");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "lehnt nicht-endliche Zahlen ab: %s",
    (value) => {
      expect(() => canonicalizeJsonForHash(value)).toThrow("canonical_json_non_finite_number");
    }
  );

  it("lässt undefined-Objektfelder aus, lehnt undefined in Arrays aber ab", () => {
    expect(canonicalizeJsonForHash({ keep: true, omit: undefined })).toEqual({ keep: true });
    expect(() => canonicalizeJsonForHash([undefined])).toThrow("canonical_json_unsupported_value");
  });

  it("lehnt BigInt, Nicht-JSON-Objekte und zyklische Strukturen ab", () => {
    expect(() => canonicalizeJsonForHash(BigInt(1))).toThrow("canonical_json_unsupported_value");
    expect(() => canonicalizeJsonForHash(new Date("2026-08-12T00:00:00Z"))).toThrow(
      "canonical_json_unsupported_value"
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeJsonForHash(cyclic)).toThrow("canonical_json_cycle");
  });
});
