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
var practiceResponse = http.post(SUPABASE_URL + "/rest/v1/rpc/create_or_get_own_practice", {
  headers: {
    apikey: SUPABASE_ANON_KEY,
    Authorization: "Bearer " + signupData.access_token,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    p_domain: domain,
    p_email: email
  })
});
var practices = json(practiceResponse.body);
var practice = practices[0];
var deleteResponse = http.post(WORKER_URL + "/api/privacy/delete", {
  headers: {
    Authorization: "Bearer " + signupData.access_token,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    practiceId: practice.id
  })
});
var deleteData = json(deleteResponse.body);

output.privacy = {
  status: deleteResponse.status,
  ok: deleteData.ok,
  state: deleteData.deletion && deleteData.deletion.state,
  practiceId: practice.id
};
