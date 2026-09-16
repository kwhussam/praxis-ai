import { createHash, webcrypto } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { buildPdfSections, buildSimplePdf } from "../../workers/hono/src/report-pdf-artifact.ts";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error("usage: verify-report-artifact.mjs <input-json> <output-json>");

const keyHex = process.env.RECOVERY_TEST_DATA_KEY;
if (!keyHex) throw new Error("RECOVERY_TEST_DATA_KEY is required; refusing to decrypt without explicit test material");
if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error("RECOVERY_TEST_DATA_KEY must be exactly 32 bytes of hex");

const artifact = JSON.parse(await readFile(inputPath, "utf8"));
const reportRow = requireRecord(artifact.report, "report");
const manifestRow = requireRecord(artifact.assessment_manifest, "assessment_manifest");
const practice = requireRecord(artifact.practice, "practice");
const manifest = requireRecord(reportRow.report_manifest, "report.report_manifest");

if (reportRow.assessment_manifest_id !== manifestRow.id) throw new Error("manifest_id_binding_failed");
if (manifestRow.practice_id !== reportRow.practice_id) throw new Error("manifest_tenant_binding_failed");
if (manifest.assessment_snapshot?.id !== manifestRow.id) throw new Error("snapshot_manifest_binding_failed");

const report = await decryptJson(reportRow.encrypted_content, keyHex);
const snapshot = await decryptJson(manifestRow.encrypted_snapshot, keyHex);
const reportHash = sha256Json(report);
const snapshotHash = sha256Json(snapshot);
const manifestHash = sha256Json(manifest);

if (reportHash !== reportRow.payload_sha256 || reportHash !== manifest.report_payload_sha256) {
  throw new Error("report_hash_mismatch");
}
if (snapshotHash !== manifestRow.snapshot_sha256 || snapshotHash !== manifest.assessment_snapshot.sha256) {
  throw new Error("snapshot_hash_mismatch");
}
if (manifestHash !== reportRow.report_manifest_sha256 || manifestHash !== manifestRow.manifest_sha256) {
  throw new Error("manifest_hash_mismatch");
}

const pdf = buildSimplePdf(buildPdfSections({
  reportId: reportRow.id,
  practiceName: String(practice.name),
  domain: typeof practice.domain === "string" ? practice.domain : undefined,
  report,
  manifest,
  manifestSha256: manifestHash
}));

const evidence = {
  manifest_sha256: manifestHash,
  pdf_sha256: sha256Text(pdf),
  report_sha256: reportHash,
  snapshot_sha256: snapshotHash
};
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });

async function decryptJson(envelopeValue, keyValue) {
  const envelope = requireRecord(envelopeValue, "encrypted envelope");
  if (envelope.alg !== "AES-256-GCM" || typeof envelope.iv !== "string" || typeof envelope.data !== "string") {
    throw new Error("invalid_encrypted_envelope");
  }
  const key = await webcrypto.subtle.importKey(
    "raw", Buffer.from(keyValue, "hex"), { name: "AES-GCM" }, false, ["decrypt"]
  );
  const plaintext = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(envelope.iv, "base64") },
    key,
    Buffer.from(envelope.data, "base64")
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function sha256Json(value) {
  return sha256Text(JSON.stringify(canonicalize(value)));
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return Object.is(value, -0) ? 0 : value;
  return Object.fromEntries(
    Object.keys(value).sort().flatMap((key) => value[key] === undefined ? [] : [[key, canonicalize(value[key])]])
  );
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}_must_be_object`);
  return value;
}
