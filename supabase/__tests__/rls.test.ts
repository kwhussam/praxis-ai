import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_KEY;
const practiceAEmail = process.env.TEST_PRACTICE_A_EMAIL;
const practiceAPassword = process.env.TEST_PRACTICE_A_PASSWORD;
const practiceBId = process.env.TEST_PRACTICE_B_ID;

const describeIfConfigured = url && anonKey && serviceRoleKey && practiceAEmail && practiceAPassword && practiceBId ? describe : describe.skip;

describeIfConfigured("RLS: Praxis darf nur eigene Daten sehen", () => {
  it("Praxis A sieht keine Scans von Praxis B", async () => {
    const clientA = createClient(url!, anonKey!);
    await clientA.auth.signInWithPassword({ email: practiceAEmail!, password: practiceAPassword! });

    const { data, error } = await clientA.from("security_checks").select("*").eq("practice_id", practiceBId!);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("Admin kann alle Praxen sehen", async () => {
    const adminClient = createClient(url!, serviceRoleKey!);
    const { data, error } = await adminClient.from("practices").select("*");

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(1);
  });
});
