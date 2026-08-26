var authResponse = http.post(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
  headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD })
});
var authData = json(authResponse.body);
var authHeaders = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + authData.access_token };

// select=id alone only proves a row exists. The New Architecture proof needs the stored
// collection results, otherwise a probe that never ran would still look green.
var scansResponse = http.get(
  SUPABASE_URL + "/rest/v1/wlan_scans?select=id,network_info&practice_id=eq." + PRACTICE_ID + "&limit=1",
  { headers: authHeaders }
);
var consentResponse = http.get(
  SUPABASE_URL + "/rest/v1/consent_log?select=id&practice_id=eq." + PRACTICE_ID +
    "&type=eq.wlan_scan&accepted=eq.true&limit=1",
  { headers: authHeaders }
);
var scans = json(scansResponse.body);
var consents = json(consentResponse.body);

// Mirrors scripts/e2e/wlan-evidence.js. Keep both in sync; a regression test enforces it.
var MODULE_FAILURE = /_module_unavailable$|_probe_failed$/;
var info = scans.length > 0 && scans[0].network_info ? scans[0].network_info : {};
var collection = info.collection || {};
var nativeProbeEvidence = info.nativeProbeEvidence || {};
var measured = [];
var nativeMeasured = [];
var platformLimited = [];
var notCollected = [];
var errors = [];
var sensors = Object.keys(collection).sort();
for (var i = 0; i < sensors.length; i++) {
  var sensor = sensors[i];
  var entry = collection[sensor] || {};
  var reason = String(entry.reason || "");
  if (entry.status === "collected") measured.push(sensor);
  else if (entry.status === "unsupported") platformLimited.push(sensor);
  else notCollected.push(sensor + ":" + String(entry.status));
  if (MODULE_FAILURE.test(reason)) errors.push(sensor + " reports a native module failure: " + reason);
}
var requiredNativeProbes = ["tcp", "ssdp"];
for (var p = 0; p < requiredNativeProbes.length; p++) {
  var probe = requiredNativeProbes[p];
  var evidence = nativeProbeEvidence[probe];
  if (!evidence || typeof evidence !== "object") {
    errors.push("missing native probe evidence: " + probe);
    continue;
  }
  var errorCodes = Array.isArray(evidence.errorCodes) ? evidence.errorCodes : [];
  for (var e = 0; e < errorCodes.length; e++) {
    if (MODULE_FAILURE.test(String(errorCodes[e]))) {
      errors.push(probe + " reports a native module failure: " + String(errorCodes[e]));
    }
  }
  if (evidence.status === "collected" && evidence.source === "measured" && evidence.sampleCount > 0) {
    nativeMeasured.push(probe);
  } else {
    errors.push(probe + " did not provide native measured evidence: " +
      String(evidence.status) + "/" + String(evidence.source));
  }
}
if (sensors.length === 0) errors.push("network_info contains no collection block; nothing was measured");

output.wlanSync = {
  scanPersisted: scansResponse.status === 200 && scans.length > 0,
  consentPersisted: consentResponse.status === 200 && consents.length > 0,
  scanStatus: scansResponse.status,
  consentStatus: consentResponse.status,
  measured: measured.join(","),
  nativeMeasured: nativeMeasured.join(","),
  platformLimited: platformLimited.join(","),
  notCollected: notCollected.join(","),
  errors: errors.join(" | "),
  probeEvidenceOk: errors.length === 0
};
