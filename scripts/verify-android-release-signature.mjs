import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const artifactPath = resolve(process.argv[2] ?? "");
const expectedFingerprint = normalizeFingerprint(process.env.ANDROID_SIGNING_CERT_SHA256 ?? "");
if (!process.argv[2]) throw new Error("Usage: verify-android-release-signature.mjs <signed-aab-or-apk>");
if (!/^[A-F0-9]{64}$/.test(expectedFingerprint)) {
  throw new Error("ANDROID_SIGNING_CERT_SHA256 must contain the expected 32-byte SHA-256 certificate fingerprint");
}

const result = spawnSync("keytool", ["-printcert", "-jarfile", artifactPath], {
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024
});
if (result.status !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  throw new Error("Android release artifact has no verifiable JAR signature");
}

const output = `${result.stdout}\n${result.stderr}`;
if (/Android Debug|androiddebugkey/i.test(output)) throw new Error("Android release artifact uses a debug certificate");
const actualFingerprint = normalizeFingerprint(output.match(/SHA[- ]?256:\s*([A-Fa-f0-9: ]{64,})/)?.[1] ?? "");
if (!actualFingerprint) throw new Error("Could not read the Android signing certificate SHA-256 fingerprint");
if (actualFingerprint !== expectedFingerprint) throw new Error("Android release certificate does not match the approved fingerprint");

console.log(`Android release signature verified: SHA-256 ${actualFingerprint}`);

function normalizeFingerprint(value) {
  return value.replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
}
