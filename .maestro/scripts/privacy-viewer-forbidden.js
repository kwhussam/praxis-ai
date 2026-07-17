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
var deleteResponse = http.post(WORKER_URL + "/api/privacy/delete", {
  headers: {
    Authorization: "Bearer " + authData.access_token,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    practiceId: PRACTICE_ID
  })
});
var deleteData = json(deleteResponse.body);

output.privacy = {
  status: deleteResponse.status,
  error: deleteData.error
};
