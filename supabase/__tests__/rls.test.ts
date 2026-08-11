import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const practiceAEmail = process.env.TEST_PRACTICE_A_EMAIL;
const practiceAPassword = process.env.TEST_PRACTICE_A_PASSWORD;
const practiceBId = process.env.TEST_PRACTICE_B_ID;

const requiredConfig = {
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  TEST_PRACTICE_A_EMAIL: practiceAEmail,
  TEST_PRACTICE_A_PASSWORD: practiceAPassword,
  TEST_PRACTICE_B_ID: practiceBId
};

const missingConfig = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([name]) => name);

const configErrorMessage = `RLS integration tests are missing required configuration: ${missingConfig.join(", ")}`;
const isCi = process.env.CI === "true";
const describeIfConfigured = missingConfig.length === 0 ? describe : describe.skip;

if (missingConfig.length > 0 && isCi) {
  throw new Error(configErrorMessage);
}

if (missingConfig.length > 0 && !isCi) {
  console.warn(`${configErrorMessage}. Skipping locally; CI must provide this configuration.`);
}

describeIfConfigured("RLS: Praxis darf nur eigene Daten sehen", () => {
  it("Praxis A sieht keine Scans von Praxis B", async () => {
    const clientA = createClient(url!, anonKey!);
    const signIn = await clientA.auth.signInWithPassword({ email: practiceAEmail!, password: practiceAPassword! });
    expect(signIn.error).toBeNull();
    expect(signIn.data.session).not.toBeNull();

    const { data, error } = await clientA.from("security_checks").select("*").eq("practice_id", practiceBId!);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("Praxis A sieht kein Assessment-Manifest von Praxis B", async () => {
    const manifestId = "70000000-0000-4000-8000-0000000000b1";
    const adminClient = createClient(url!, serviceRoleKey!);
    await adminClient.from("assessment_manifests").delete().eq("id", manifestId);
    const { error: seedError } = await adminClient.from("assessment_manifests").insert({
      id: manifestId,
      practice_id: practiceBId!,
      source_check_id: "40000000-0000-4000-8000-0000000000b1",
      manifest_version: "1.0.0",
      assessment_profile: "health",
      facts_version: "1.0.0",
      scoring_version: "2026.1",
      report_format_version: "1.0.0",
      pdf_template_version: "1.0.0",
      snapshot_sha256: "a".repeat(64),
      manifest: { fixture: true },
      manifest_sha256: "b".repeat(64),
      encrypted_snapshot: { fixture: true },
      created_at: "2026-08-11T10:00:00.000Z"
    });
    expect(seedError).toBeNull();

    try {
      const clientA = createClient(url!, anonKey!);
      const signIn = await clientA.auth.signInWithPassword({ email: practiceAEmail!, password: practiceAPassword! });
      expect(signIn.error).toBeNull();
      expect(signIn.data.session).not.toBeNull();
      const { data, error } = await clientA.from("assessment_manifests").select("id").eq("id", manifestId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    } finally {
      await adminClient.from("assessment_manifests").delete().eq("id", manifestId);
    }
  });

  it("Admin kann alle Praxen sehen", async () => {
    const adminClient = createClient(url!, serviceRoleKey!);
    const { data, error } = await adminClient.from("practices").select("*");

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(1);
  });

  it("persistiert Assessment-Manifest und Bericht atomar und idempotent", async () => {
    const adminClient = createClient(url!, serviceRoleKey!);
    const clientSyncId = "sp2-04-atomic-fixture";
    const firstReportId = "71000000-0000-4000-8000-0000000000a1";
    const firstManifestId = "72000000-0000-4000-8000-0000000000a1";
    const common = {
      p_practice_id: "20000000-0000-4000-8000-0000000000a1",
      p_source_check_id: "40000000-0000-4000-8000-0000000000a1",
      p_created_at: "2026-08-11T10:00:00.000Z",
      p_manifest_version: "1.0.0",
      p_assessment_profile: "general",
      p_facts_version: "1.0.0",
      p_scoring_version: "2026.1",
      p_report_format_version: "1.0.0",
      p_pdf_template_version: "1.0.0",
      p_snapshot_sha256: "a".repeat(64),
      p_manifest: { fixture: true },
      p_manifest_sha256: "b".repeat(64),
      p_encrypted_snapshot: { fixture: "encrypted-snapshot" },
      p_report_summary: { security_score: 80 },
      p_encrypted_report: { fixture: "encrypted-report" },
      p_report_sha256: "c".repeat(64),
      p_client_sync_id: clientSyncId
    };

    const first = await adminClient.rpc("persist_assessment_report", {
      ...common,
      p_report_id: firstReportId,
      p_manifest_id: firstManifestId
    });
    const retry = await adminClient.rpc("persist_assessment_report", {
      ...common,
      p_report_id: "71000000-0000-4000-8000-0000000000a2",
      p_manifest_id: "72000000-0000-4000-8000-0000000000a2"
    });

    expect(first.error).toBeNull();
    expect(retry.error).toBeNull();
    expect(first.data).toEqual({ report_id: firstReportId, assessment_manifest_id: firstManifestId });
    expect(retry.data).toEqual(first.data);

    const reports = await adminClient.from("reports").select("id,assessment_manifest_id").eq("client_sync_id", clientSyncId);
    const manifests = await adminClient.from("assessment_manifests").select("id").eq("id", firstManifestId);
    expect(reports.error).toBeNull();
    expect(reports.data).toEqual([{ id: firstReportId, assessment_manifest_id: firstManifestId }]);
    expect(manifests.error).toBeNull();
    expect(manifests.data).toEqual([{ id: firstManifestId }]);
  });
});
