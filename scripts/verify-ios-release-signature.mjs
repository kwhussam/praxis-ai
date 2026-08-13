import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ipaPath = resolve(process.argv[2] ?? "");
const expectedTeamId = process.env.APPLE_TEAM_ID ?? "";
const expectedFingerprint = normalizeFingerprint(process.env.APPLE_SIGNING_CERT_SHA256 ?? "");
if (!process.argv[2]) throw new Error("Usage: verify-ios-release-signature.mjs <signed-ipa>");
if (!/^[A-Z0-9]{10}$/.test(expectedTeamId)) throw new Error("APPLE_TEAM_ID must contain the approved 10-character team ID");
if (!/^[A-F0-9]{64}$/.test(expectedFingerprint)) throw new Error("APPLE_SIGNING_CERT_SHA256 must contain the approved SHA-256 certificate fingerprint");

const extractionRoot = mkdtempSync(join(tmpdir(), "praxisshield-ios-signature-"));
try {
  run("/usr/bin/unzip", ["-q", ipaPath, "-d", extractionRoot]);
  const payloadRoot = join(extractionRoot, "Payload");
  const apps = readdirSync(payloadRoot).filter((name) => name.endsWith(".app"));
  if (apps.length !== 1) throw new Error(`Expected exactly one app in IPA, found ${apps.length}`);
  const appPath = join(payloadRoot, apps[0]);

  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath]);
  const details = run("/usr/bin/codesign", ["-d", "--verbose=4", appPath], true);
  if (!details.includes(`TeamIdentifier=${expectedTeamId}`)) throw new Error("iOS release TeamIdentifier does not match the approved team");
  if (/Authority=Apple Development/i.test(details)) throw new Error("iOS release uses a development certificate");

  const entitlements = run("/usr/bin/codesign", ["-d", "--entitlements", ":-", appPath], true);
  if (!entitlements.includes(`<string>${expectedTeamId}.ai.praxisshield.app</string>`)) {
    throw new Error("iOS application identifier is not bound to the approved team and bundle ID");
  }
  if (!entitlements.includes("com.apple.developer.networking.wifi-info")) {
    throw new Error("Signed iOS release is missing the Wi-Fi information entitlement");
  }
  if (/<key>get-task-allow<\/key>\s*<true\s*\/>/.test(entitlements)) {
    throw new Error("Signed iOS release still permits debugger attachment");
  }

  const certificatePrefix = join(extractionRoot, "signing-certificate");
  run("/usr/bin/codesign", ["-d", `--extract-certificates=${certificatePrefix}`, appPath], true);
  const certificatePath = `${certificatePrefix}0`;
  readFileSync(certificatePath);
  const fingerprintOutput = run("/usr/bin/openssl", ["x509", "-inform", "DER", "-in", certificatePath, "-noout", "-fingerprint", "-sha256"]);
  const actualFingerprint = normalizeFingerprint(fingerprintOutput.split("=").at(-1) ?? "");
  if (actualFingerprint !== expectedFingerprint) throw new Error("iOS release certificate does not match the approved fingerprint");

  console.log(`iOS release signature verified: team ${expectedTeamId}, SHA-256 ${actualFingerprint}`);
} finally {
  rmSync(extractionRoot, { recursive: true, force: true });
}

function run(command, args, includeStderr = false) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return includeStderr ? `${result.stdout}\n${result.stderr}` : result.stdout;
}

function normalizeFingerprint(value) {
  return value.replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
}
