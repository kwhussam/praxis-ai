var suffix = String(Date.now());
var email = "privacy-owner-" + suffix + "@example.test";
var password = "Disposable-Privacy-2026!";
var domain = "privacy-delete-" + suffix + ".example.test";
var signupResponse = http.post(SUPABASE_URL + "/auth/v1/signup", {
  headers: {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    email: email,
    password: password
  })
});
var signupData = json(signupResponse.body);
if (
  signupResponse.status !== 200 ||
  !signupData ||
  !signupData.user ||
  !signupData.user.id ||
  !signupData.access_token
) {
  throw new Error(
    "Disposable privacy owner could not be created (status " + signupResponse.status + "): " +
      String(signupResponse.body)
  );
}
var staffActorId = "00000000-0000-4000-8000-0000000000e1";
var practiceResponse = http.post(SUPABASE_URL + "/rest/v1/rpc/backoffice_create_practice", {
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    p_actor: staffActorId,
    p_request_id: "privacy-create-" + suffix,
    p_idempotency_key: "privacy-create-" + suffix,
    p_practice_kind: "general",
    p_legal_name: "Disposable Privacy Practice",
    p_display_name: "Disposable Privacy Practice",
    p_contact_first_name: "Privacy",
    p_contact_last_name: "Owner",
    p_contact_email: email,
    p_contact_phone: "+49 30 10000009",
    p_street: "Teststrasse 9",
    p_postal_code: "10115",
    p_city: "Berlin",
    p_country_code: "DE",
    p_domain: domain
  })
});
var practiceData = json(practiceResponse.body);
if (practiceResponse.status !== 200 || !practiceData || practiceData.ok !== true) {
  throw new Error(
    "Disposable privacy practice could not be seeded (status " + practiceResponse.status + "): " +
      String(practiceResponse.body)
  );
}
var practiceId = practiceData.practice_id;
var ownershipResponse = http.post(SUPABASE_URL + "/rest/v1/rpc/backoffice_transfer_ownership", {
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    p_actor: staffActorId,
    p_request_id: "privacy-owner-" + suffix,
    p_idempotency_key: "privacy-owner-" + suffix,
    p_practice_id: practiceId,
    p_new_owner: signupData.user.id
  })
});
var ownershipData = json(ownershipResponse.body);
if (ownershipResponse.status !== 200 || !ownershipData || ownershipData.ok !== true) {
  throw new Error(
    "Disposable privacy ownership could not be assigned (status " + ownershipResponse.status + "): " +
      String(ownershipResponse.body)
  );
}
var deleteResponse = http.post(WORKER_URL + "/api/privacy/delete", {
  headers: {
    Authorization: "Bearer " + signupData.access_token,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    practiceId: practiceId
  })
});
var deleteData = json(deleteResponse.body);

output.privacy = {
  status: deleteResponse.status,
  ok: deleteData.ok,
  state: deleteData.deletion && deleteData.deletion.state,
  practiceId: practiceId
};
