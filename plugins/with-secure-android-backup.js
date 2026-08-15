const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod
} = require("@expo/config-plugins");

// Expo SDK 51's Android release lint accepts these five backup domains. PraxisShield is not
// directBootAware and does not create device-protected storage; verify-native-config enforces that
// manifest boundary so sensitive data cannot silently move into an uncovered storage class.
const LEGACY_RULES = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="root" path="."/>
  <exclude domain="file" path="."/>
  <exclude domain="database" path="."/>
  <exclude domain="sharedpref" path="."/>
  <exclude domain="external" path="."/>
</full-backup-content>
`;

const EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="root" path="."/>
    <exclude domain="file" path="."/>
    <exclude domain="database" path="."/>
    <exclude domain="sharedpref" path="."/>
    <exclude domain="external" path="."/>
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" path="."/>
    <exclude domain="file" path="."/>
    <exclude domain="database" path="."/>
    <exclude domain="sharedpref" path="."/>
    <exclude domain="external" path="."/>
  </device-transfer>
</data-extraction-rules>
`;

function androidUsesCleartextTraffic(environment = process.env) {
  const localE2eRequested = environment.EXPO_PUBLIC_APP_ENV === "test";
  const explicitLocalOverride = environment.PRAXISSHIELD_ALLOW_LOCAL_CLEARTEXT === "1";
  return localE2eRequested && explicitLocalOverride ? "true" : "false";
}

function hardenAndroidReleaseSigning(contents) {
  const signingContract = "PraxisShield release signing contract v1";
  if (contents.includes(signingContract)) return contents;
  const releaseStart = contents.indexOf("release {");
  const debugSigning = "signingConfig signingConfigs.debug";
  const protectedSigning = "Release signing is injected only by the protected CI/EAS credential provider.";
  const signingStart = contents.indexOf(debugSigning, releaseStart);
  const firstReleaseSetting = contents.indexOf("shrinkResources", releaseStart);
  if (releaseStart < 0 || firstReleaseSetting < releaseStart) {
    throw new Error("Could not locate the Android release build type");
  }

  let nextContents = contents;
  if (signingStart >= releaseStart && signingStart <= firstReleaseSetting) {
    nextContents =
      contents.slice(0, signingStart) +
      `// ${protectedSigning}` +
      contents.slice(signingStart + debugSigning.length);
  } else if (contents.indexOf(protectedSigning, releaseStart) < 0) {
    throw new Error("Could not remove the Expo template's debug signing from the Android release build");
  }

  const environmentContract = `
// ${signingContract}. Values are supplied only by the protected release job.
def praxisShieldReleaseSigningValues = [
    System.getenv("ANDROID_KEYSTORE_PATH"),
    System.getenv("ANDROID_KEYSTORE_PASSWORD"),
    System.getenv("ANDROID_KEY_ALIAS"),
    System.getenv("ANDROID_KEY_PASSWORD")
]
def praxisShieldReleaseSigningRequested = praxisShieldReleaseSigningValues.any { it != null && !it.isEmpty() }
def praxisShieldReleaseSigningConfigured = praxisShieldReleaseSigningValues.every { it != null && !it.isEmpty() }
if (praxisShieldReleaseSigningRequested && !praxisShieldReleaseSigningConfigured) {
    throw new GradleException("Incomplete PraxisShield Android release signing configuration")
}

`;
  const signingConfiguration = `    if (praxisShieldReleaseSigningConfigured) {
        signingConfigs {
            release {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
`;
  const androidStart = nextContents.indexOf("android {");
  if (androidStart < 0) throw new Error("Could not locate the Android configuration block");
  nextContents = nextContents.slice(0, androidStart) + environmentContract + nextContents.slice(androidStart);
  const buildTypesStart = nextContents.indexOf("    buildTypes {", androidStart + environmentContract.length);
  if (buildTypesStart < 0) throw new Error("Could not locate Android buildTypes for release signing");
  nextContents = nextContents.slice(0, buildTypesStart) + signingConfiguration + nextContents.slice(buildTypesStart);
  const protectedComment = `// ${protectedSigning}`;
  const protectedCommentStart = nextContents.indexOf(protectedComment, buildTypesStart + signingConfiguration.length);
  if (protectedCommentStart < 0) throw new Error("Could not locate protected Android signing marker");
  const protectedCommentEnd = protectedCommentStart + protectedComment.length;
  return (
    nextContents.slice(0, protectedCommentEnd) +
    `\n            if (praxisShieldReleaseSigningConfigured) { signingConfig signingConfigs.release }` +
    nextContents.slice(protectedCommentEnd)
  );
}

module.exports = function withSecureAndroidBackup(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    application.$["android:allowBackup"] = "false";
    application.$["android:fullBackupContent"] = "@xml/backup_rules";
    application.$["android:dataExtractionRules"] = "@xml/data_extraction_rules";
    application.$["android:usesCleartextTraffic"] = androidUsesCleartextTraffic();
    const permissions = modConfig.modResults.manifest["uses-permission"] ?? [];
    const nearbyWifi = permissions.find(
      (permission) => permission.$["android:name"] === "android.permission.NEARBY_WIFI_DEVICES"
    );
    if (nearbyWifi) nearbyWifi.$["android:usesPermissionFlags"] = "neverForLocation";
    return modConfig;
  });

  config = withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== "groovy") {
      throw new Error("PraxisShield requires a Groovy Android app build file");
    }
    modConfig.modResults.contents = hardenAndroidReleaseSigning(modConfig.modResults.contents);
    return modConfig;
  });

  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const resourceDir = path.join(modConfig.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(resourceDir, { recursive: true });
      fs.writeFileSync(path.join(resourceDir, "backup_rules.xml"), LEGACY_RULES);
      fs.writeFileSync(path.join(resourceDir, "data_extraction_rules.xml"), EXTRACTION_RULES);
      return modConfig;
    }
  ]);
};

module.exports.hardenAndroidReleaseSigning = hardenAndroidReleaseSigning;
module.exports.androidUsesCleartextTraffic = androidUsesCleartextTraffic;
