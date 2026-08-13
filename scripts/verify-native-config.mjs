import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const appConfig = JSON.parse(readFileSync(resolve(root, "app.json"), "utf8")).expo;

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function requireText(contents, expected, source) {
  if (!contents.includes(expected)) throw new Error(`${source} is missing: ${expected}`);
}

function forbidText(contents, forbidden, source) {
  if (contents.includes(forbidden)) throw new Error(`${source} unexpectedly contains: ${forbidden}`);
}

const iosEntitlements = read("ios/PraxisShieldAI/PraxisShieldAI.entitlements");
requireText(iosEntitlements, "<key>com.apple.developer.networking.wifi-info</key>", "iOS entitlements");
requireText(iosEntitlements, "<true/>", "iOS entitlements");

const iosInfo = read("ios/PraxisShieldAI/Info.plist");
requireText(iosInfo, "NSLocalNetworkUsageDescription", "iOS Info.plist");
requireText(iosInfo, "NSLocationWhenInUseUsageDescription", "iOS Info.plist");
forbidText(iosInfo, "NSBonjourServices", "iOS Info.plist");
requireText(iosInfo, `<string>${appConfig.version}</string>`, "iOS release version");
requireText(iosInfo, `<string>${appConfig.ios.buildNumber}</string>`, "iOS release build number");

const iosProject = read("ios/PraxisShieldAI.xcodeproj/project.pbxproj");
for (const fileName of ["PraxisShieldNetworkProbe.swift", "PraxisShieldNetworkProbeBridge.m"]) {
  requireText(iosProject, `${fileName} in Sources`, "iOS Xcode project");
  requireText(read(`ios/PraxisShieldAI/${fileName}`), "PraxisShieldNetworkProbe", `iOS ${fileName}`);
}
requireText(
  read("ios/PraxisShieldAI/PraxisShieldAI-Bridging-Header.h"),
  "#import <React/RCTBridgeModule.h>",
  "iOS bridging header"
);

const androidManifest = read("android/app/src/main/AndroidManifest.xml");
requireText(androidManifest, 'android:allowBackup="false"', "Android release manifest");
requireText(androidManifest, 'android:fullBackupContent="@xml/backup_rules"', "Android release manifest");
requireText(androidManifest, 'android:dataExtractionRules="@xml/data_extraction_rules"', "Android release manifest");
requireText(androidManifest, 'android:usesCleartextTraffic="false"', "Android release manifest");
forbidText(androidManifest, "android:directBootAware=", "Android release manifest");
requireText(androidManifest, 'android:name="android.permission.ACCESS_FINE_LOCATION"', "Android release manifest");
requireText(
  androidManifest,
  'android:name="android.permission.NEARBY_WIFI_DEVICES" android:usesPermissionFlags="neverForLocation"',
  "Android release manifest"
);
for (const permission of ["READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE", "SYSTEM_ALERT_WINDOW"]) {
  requireText(
    androidManifest,
    `android:name="android.permission.${permission}" tools:node="remove"`,
    "Android permission removal contract"
  );
}

const androidApplication = read("android/app/src/main/java/ai/praxisshield/app/MainApplication.kt");
const androidProbe = read(
  "android/app/src/main/java/ai/praxisshield/app/networkprobe/PraxisShieldNetworkProbeModule.kt"
);
requireText(androidApplication, "PraxisShieldNetworkProbePackage()", "Android MainApplication");
requireText(androidProbe, "class PraxisShieldNetworkProbeModule", "Android network probe");

const androidBuild = read("android/app/build.gradle");
requireText(androidBuild, `versionCode ${appConfig.android.versionCode}`, "Android release version code");
requireText(androidBuild, `versionName "${appConfig.version}"`, "Android release version name");
const buildTypesStart = androidBuild.indexOf("buildTypes {");
const releaseBuildStart = androidBuild.indexOf("release {", buildTypesStart);
if (buildTypesStart < 0 || releaseBuildStart < buildTypesStart) {
  throw new Error("Android release build type is missing");
}
const releaseBuild = androidBuild.slice(releaseBuildStart, androidBuild.indexOf("packagingOptions", releaseBuildStart));
forbidText(releaseBuild, "signingConfig signingConfigs.debug", "Android release build type");
requireText(androidBuild, "PraxisShield release signing contract v1", "Android release signing contract");
requireText(androidBuild, 'System.getenv("ANDROID_KEYSTORE_PATH")', "Android protected release signing");
requireText(androidBuild, "praxisShieldReleaseSigningConfigured", "Android protected release signing");
requireText(
  releaseBuild,
  "Release signing is injected only by the protected CI/EAS credential provider.",
  "Android release build type"
);

const credentialDomains = ["root", "file", "database", "sharedpref", "external"];
const deviceProtectedDomains = ["device_root", "device_file", "device_database", "device_sharedpref"];

const legacyRules = read("android/app/src/main/res/xml/backup_rules.xml");
for (const domain of credentialDomains) {
  requireText(legacyRules, `<exclude domain="${domain}" path="."/>`, "Android legacy backup rules");
}
for (const domain of deviceProtectedDomains) {
  forbidText(legacyRules, `domain="${domain}"`, "Android legacy backup rules");
}

const extractionRules = read("android/app/src/main/res/xml/data_extraction_rules.xml");
requireText(extractionRules, "<cloud-backup>", "Android data extraction rules");
requireText(extractionRules, "<device-transfer>", "Android data extraction rules");
for (const domain of credentialDomains) {
  const marker = `<exclude domain="${domain}" path="."/>`;
  if (extractionRules.split(marker).length - 1 !== 2) {
    throw new Error(`Android data extraction rules must exclude ${domain} from cloud backup and device transfer`);
  }
}
for (const domain of deviceProtectedDomains) {
  forbidText(extractionRules, `domain="${domain}"`, "Android 12+ data extraction rules");
}

console.log("Native iOS/Android release configuration verified.");
