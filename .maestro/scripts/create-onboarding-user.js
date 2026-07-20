var suffix = String(Date.now());
var email = "onboarding-" + suffix + "@example.test";
var password = "Local-Onboarding-2026!";
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

output.onboardingUser = {
  status: signupResponse.status,
  email: email,
  password: password,
  hasSession: signupData.access_token != null
};
