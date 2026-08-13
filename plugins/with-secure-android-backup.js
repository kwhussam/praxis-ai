const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod
} = require("@expo/config-plugins");

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
    <exclude domain="device_root" path="."/>
    <exclude domain="device_file" path="."/>
    <exclude domain="device_database" path="."/>
    <exclude domain="device_sharedpref" path="."/>
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" path="."/>
    <exclude domain="file" path="."/>
    <exclude domain="database" path="."/>
    <exclude domain="sharedpref" path="."/>
    <exclude domain="external" path="."/>
    <exclude domain="device_root" path="."/>
    <exclude domain="device_file" path="."/>
    <exclude domain="device_database" path="."/>
    <exclude domain="device_sharedpref" path="."/>
  </device-transfer>
</data-extraction-rules>
`;

module.exports = function withSecureAndroidBackup(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    application.$["android:allowBackup"] = "false";
    application.$["android:fullBackupContent"] = "@xml/backup_rules";
    application.$["android:dataExtractionRules"] = "@xml/data_extraction_rules";
    application.$["android:usesCleartextTraffic"] = "false";
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
    const contents = modConfig.modResults.contents;
    const releaseStart = contents.indexOf("release {");
    const debugSigning = "signingConfig signingConfigs.debug";
    const protectedSigning = "Release signing is injected only by the protected CI/EAS credential provider.";
    if (releaseStart >= 0 && contents.indexOf(protectedSigning, releaseStart) >= 0) return modConfig;
    const signingStart = contents.indexOf(debugSigning, releaseStart);
    const firstReleaseSetting = contents.indexOf("shrinkResources", releaseStart);
    if (releaseStart < 0 || signingStart < releaseStart || signingStart > firstReleaseSetting) {
      throw new Error("Could not remove the Expo template's debug signing from the Android release build");
    }
    modConfig.modResults.contents =
      contents.slice(0, signingStart) +
      `// ${protectedSigning}` +
      contents.slice(signingStart + debugSigning.length);
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
