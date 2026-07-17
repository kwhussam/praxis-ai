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
var authHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: "Bearer " + authData.access_token
};
var scansResponse = http.get(
  SUPABASE_URL + "/rest/v1/wlan_scans?select=id&practice_id=eq." + PRACTICE_ID + "&limit=1",
  { headers: authHeaders }
);
var consentResponse = http.get(
  SUPABASE_URL +
    "/rest/v1/consent_log?select=id&practice_id=eq." +
    PRACTICE_ID +
    "&consent_type=eq.wlan_scan&accepted=eq.true&limit=1",
  { headers: authHeaders }
);
var scans = json(scansResponse.body);
var consents = json(consentResponse.body);

output.wlanSync = {
  scanPersisted: scansResponse.status === 200 && scans.length > 0,
  consentPersisted: consentResponse.status === 200 && consents.length > 0,
  scanStatus: scansResponse.status,
  consentStatus: consentResponse.status
};
