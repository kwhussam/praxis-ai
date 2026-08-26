// Shared evaluation rules for the WLAN end-to-end evidence check.
// The Maestro script mirrors these rules inline because Maestro's JS engine cannot
// require modules; security/__tests__/wlan-evidence.test.ts guards against drift.

// A native module that cannot be resolved at runtime is the exact failure mode the
// New Architecture interop layer would produce. It must never pass as "no finding".
const MODULE_FAILURE = /_module_unavailable$|_probe_failed$/;

function evaluateWlanEvidence(networkInfo) {
  const info = networkInfo || {};
  const collection = info.collection || {};
  const nativeProbeEvidence = info.nativeProbeEvidence || {};
  const measured = [];
  const nativeMeasured = [];
  const platformLimited = [];
  const notCollected = [];
  const errors = [];

  for (const sensor of Object.keys(collection).sort()) {
    const entry = collection[sensor] || {};
    const status = entry.status;
    const reason = String(entry.reason || "");

    if (status === "collected") measured.push(sensor);
    else if (status === "unsupported") platformLimited.push(sensor);
    else notCollected.push(sensor + ":" + String(status));

    if (MODULE_FAILURE.test(reason)) {
      errors.push(sensor + " reports a native module failure: " + reason);
    }
  }

  // NetInfo/current-WiFi can succeed while PraxisShieldNetworkProbe is absent. The
  // New Architecture proof therefore requires the two bridge methods exercised by
  // the WLAN scan itself, rather than accepting any unrelated collected sensor.
  for (const probe of ["tcp", "ssdp"]) {
    const entry = nativeProbeEvidence[probe];
    if (!entry || typeof entry !== "object") {
      errors.push("missing native probe evidence: " + probe);
      continue;
    }
    const errorCodes = Array.isArray(entry.errorCodes) ? entry.errorCodes : [];
    for (const errorCode of errorCodes) {
      if (MODULE_FAILURE.test(String(errorCode))) {
        errors.push(probe + " reports a native module failure: " + String(errorCode));
      }
    }
    if (entry.status === "collected" && entry.source === "measured" && entry.sampleCount > 0) {
      nativeMeasured.push(probe);
    } else {
      errors.push(
        probe + " did not provide native measured evidence: " +
        String(entry.status) + "/" + String(entry.source)
      );
    }
  }

  if (Object.keys(collection).length === 0) {
    errors.push("network_info contains no collection block; nothing was measured");
  }

  return {
    ok: errors.length === 0,
    measured: measured,
    nativeMeasured: nativeMeasured,
    platformLimited: platformLimited,
    notCollected: notCollected,
    errors: errors
  };
}

module.exports = { evaluateWlanEvidence, MODULE_FAILURE };
