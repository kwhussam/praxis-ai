var authResponse = http.post(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
  headers: {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    email: EMAIL,
    password: PASSWORD
  })
});
var authData = json(authResponse.body);
var checksResponse = http.get(
  SUPABASE_URL +
    "/rest/v1/security_checks?select=id&practice_id=eq." +
    PRACTICE_ID +
    "&type=eq.questionnaire&limit=1",
  {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + authData.access_token
    }
  }
);
var checks = json(checksResponse.body);

output.questionnaire = {
  persisted: checksResponse.status === 200 && checks.length > 0,
  status: checksResponse.status
};
