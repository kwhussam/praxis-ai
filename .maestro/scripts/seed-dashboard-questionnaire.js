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
var questionnaireResponse = http.post(WORKER_URL + "/api/check/questionnaire", {
  headers: {
    Authorization: "Bearer " + authData.access_token,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    practiceId: PRACTICE_ID,
    assessmentProfile: "general",
    clientSyncId: "maestro-dashboard-responsive",
    questionnaire: {
      mfa: true,
      backups: false,
      patching: null,
      privacyDocuments: true,
      securityOwnerAssigned: true,
      networkStructureDocumented: false,
      dnsFilterEnabled: null,
      dhcpAuthorizedServerDocumented: true,
      routerFirmwareCurrent: false,
      ipv6UsedIntentionally: null,
      staffTraining: true
    }
  })
});
var questionnaireData = json(questionnaireResponse.body);

output.dashboardSeed = {
  persisted: questionnaireResponse.status === 200 && Boolean(questionnaireData.checkId),
  status: questionnaireResponse.status
};
