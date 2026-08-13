import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const outputPath = resolve(process.argv[2] ?? "build/security/ExportOptions.plist");
const teamId = requiredEnvironment("APPLE_TEAM_ID");
const profileName = requiredEnvironment("APPLE_PROVISIONING_PROFILE_NAME");
const bundleId = "ai.praxisshield.app";

mkdirSync(dirname(outputPath), { recursive: true });
copyFileSync(resolve("config/ios/ExportOptions.plist"), outputPath);
run("/usr/libexec/PlistBuddy", ["-c", `Add :teamID string ${teamId}`, outputPath]);
run("/usr/libexec/PlistBuddy", ["-c", "Add :provisioningProfiles dict", outputPath]);
run("/usr/libexec/PlistBuddy", ["-c", `Add :provisioningProfiles:${bundleId} string ${profileName}`, outputPath]);
console.log(`iOS export options prepared: ${outputPath}`);

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
}
