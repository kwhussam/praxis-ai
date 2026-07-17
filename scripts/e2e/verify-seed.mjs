import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.TEST_PRACTICE_A_PASSWORD;

if (!url || !anonKey || !serviceRoleKey || !password) {
  throw new Error("Local Supabase E2E environment is incomplete.");
}

const accounts = [
  { email: "owner-a@example.test", role: "owner" },
  { email: "manager@example.test", role: "manager" },
  { email: "partner@example.test", role: "viewer" },
  { email: "owner-b@example.test", role: "owner-cross-tenant" }
];

for (const account of accounts) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: account.email,
    password
  });

  if (error || !data.user) {
    throw new Error(`Seed account ${account.email} cannot sign in: ${error?.message ?? "missing user"}`);
  }
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const { data: practices, error: practiceError } = await admin
  .from("practices")
  .select("id,owner_id")
  .in("id", [
    "20000000-0000-4000-8000-0000000000a1",
    "20000000-0000-4000-8000-0000000000b1"
  ]);

if (practiceError || practices?.length !== 2) {
  throw new Error(`Seed practices are incomplete: ${practiceError?.message ?? practices?.length ?? 0}`);
}

const { data: grants, error: grantError } = await admin
  .from("partner_practices")
  .select("partner_id,practice_id,role")
  .eq("practice_id", "20000000-0000-4000-8000-0000000000a1");

const roles = new Set((grants ?? []).map((grant) => grant.role));
if (grantError || !roles.has("manager") || !roles.has("viewer")) {
  throw new Error(`Seed role grants are incomplete: ${grantError?.message ?? [...roles].join(",")}`);
}

console.log(`Verified ${accounts.length} login-capable accounts, 2 practices, and owner/manager/viewer roles.`);
