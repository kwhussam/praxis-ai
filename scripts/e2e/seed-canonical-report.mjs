import { createHash, webcrypto } from "node:crypto";

const practiceId = "20000000-0000-4000-8000-0000000000a1";
const sourceCheckId = "40000000-0000-4000-8000-0000000000a1";
const reportId = "a2400000-0000-4000-8000-000000000001";
const manifestId = "a2400000-0000-4000-8000-000000000002";
const clientSyncId = "sp2-04-native-pdf-smoke";
const generatedAt = "2026-08-12T10:00:00.000Z";

const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const encryptionKey = requireEnv("DATA_ENCRYPTION_KEY");

if (!/^[0-9a-f]{64}$/i.test(encryptionKey)) {
  throw new Error("Local DATA_ENCRYPTION_KEY must be a 32-byte hex fixture.");
}

const report = {
  facts_version: "1.0.0",
  scoring_version: "2026.1",
  assessment_profile: "general",
  executive_summary: "Dieser kanonische Testbericht belegt den nativen PDF-Export von PraxisShield.",
  overall_risk: "medium",
  security_score: 62,
  ampel: "gelb",
  top_risks: [{
    rank: 1,
    title: "Datensicherung testen",
    plain_language: "Die Wiederherstellung der Datensicherung muss regelmäßig praktisch geprüft werden.",
    business_impact: "Ein bestätigter Restore verkürzt einen möglichen Praxisausfall.",
    action: "Lassen Sie bis Freitag eine Testwiederherstellung durchführen.",
    effort_hours: "1-2 Stunden",
    cost_estimate: "IT-Dienstleister, 1-2 Stunden",
    priority: "diese_woche",
    evidence_source: "self_reported",
    reliability: "medium"
  }],
  scores_by_category: {
    access_control: 65,
    backup: 50,
    email_security: 60,
    network: 60,
    dsgvo: 70,
    updates: 67
  },
  dsgvo_compliance: {
    status: "teilweise",
    missing_documents: ["Wiederherstellungsnachweis"],
    liability_risk: "Der technische Nachweis der Wiederherstellung ist noch offen."
  },
  quick_wins: [{
    action: "Planen Sie bis Freitag einen Restore-Test.",
    time_minutes: 30,
    impact: "Bestätigt die Nutzbarkeit vorhandener Datensicherungen."
  }],
  not_checked_limitations: [{
    area: "Lokales Netzwerk",
    reason: "Dieser Fixture-Lauf prüft ausschließlich den kanonischen PDF-Pfad.",
    impact: "Netzwerkaussagen sind nicht Bestandteil dieses Testberichts."
  }],
  monthly_monitoring_recommendation: true
};

const snapshot = {
  id: manifestId,
  practice_id: practiceId,
  source_check_id: sourceCheckId,
  generated_at: generatedAt,
  fixture: "native-pdf-smoke"
};
const reportHash = sha256Json(report);
const snapshotHash = sha256Json(snapshot);
const manifest = {
  manifest_version: "1.0.0",
  assessment_snapshot: { id: manifestId, sha256: snapshotHash },
  source_check_id: sourceCheckId,
  generated_at: generatedAt,
  facts_version: "1.0.0",
  scoring_version: "2026.1",
  report_format_version: "1.0.0",
  report_payload_sha256: reportHash,
  pdf_template_version: "1.0.0"
};

const response = await fetch(`${supabaseUrl}/rest/v1/rpc/persist_assessment_report`, {
  method: "POST",
  headers: serviceHeaders(),
  body: JSON.stringify({
    p_report_id: reportId,
    p_manifest_id: manifestId,
    p_practice_id: practiceId,
    p_source_check_id: sourceCheckId,
    p_created_at: generatedAt,
    p_manifest_version: "1.0.0",
    p_assessment_profile: "general",
    p_facts_version: "1.0.0",
    p_scoring_version: "2026.1",
    p_report_format_version: "1.0.0",
    p_pdf_template_version: "1.0.0",
    p_snapshot_sha256: snapshotHash,
    p_manifest: manifest,
    p_manifest_sha256: sha256Json(manifest),
    p_encrypted_snapshot: await encryptJson(snapshot, 1),
    p_report_summary: { security_score: report.security_score, ampel: report.ampel, overall_risk: report.overall_risk },
    p_encrypted_report: await encryptJson(report, 2),
    p_report_sha256: reportHash,
    p_client_sync_id: clientSyncId
  })
});

if (!response.ok) {
  throw new Error(`Canonical report seed failed (${response.status}): ${await response.text()}`);
}

const persisted = await response.json();
if (persisted.report_id !== reportId || persisted.assessment_manifest_id !== manifestId) {
  throw new Error("Canonical report seed returned an unexpected artifact pair.");
}

console.log(`Canonical PDF fixture ready: ${reportId}`);

function serviceHeaders() {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

async function encryptJson(value, ivMarker) {
  const key = await webcrypto.subtle.importKey(
    "raw",
    Buffer.from(encryptionKey, "hex"),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const iv = new Uint8Array(12);
  iv[11] = ivMarker;
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value))
  );
  return {
    alg: "AES-256-GCM",
    iv: Buffer.from(iv).toString("base64"),
    data: Buffer.from(ciphertext).toString("base64"),
    created_at: generatedAt
  };
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Run scripts/e2e/env-up.sh first.`);
  return value;
}
