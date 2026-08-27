import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageLock = JSON.parse(
  readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8")
);

const hardenings = [
  {
    packageName: "@expo/plist",
    expectedVersion: "0.5.4",
    relativeFile: "build/parse.js",
    vulnerable:
      "new xmldom_1.DOMParser({ errorHandler() { } }).parseFromString(xml);",
    hardened:
      'new xmldom_1.DOMParser({ errorHandler() { } }).parseFromString(xml.trimStart(), "text/xml");'
  },
  {
    packageName: "expo-modules-core",
    expectedVersion: "55.0.25",
    relativeFile:
      "android/src/main/java/expo/modules/adapters/react/permissions/PermissionsService.kt",
    vulnerable: "return requestedPermissions!!.contains(permission)",
    hardened: "return requestedPermissions?.contains(permission) == true"
  }
];

for (const hardening of hardenings) {
  const packageSuffix = `node_modules/${hardening.packageName}`;
  const packagePaths = Object.entries(packageLock.packages)
    .filter(([packagePath]) =>
      packagePath === packageSuffix || packagePath.endsWith(`/${packageSuffix}`)
    )
    .map(([packagePath, metadata]) => ({ packagePath, version: metadata.version }));

  if (packagePaths.length === 0) {
    throw new Error(`Vendor hardening target is not installed: ${hardening.packageName}`);
  }

  for (const { packagePath, version } of packagePaths) {
    if (version !== hardening.expectedVersion) {
      throw new Error(
        `Vendor hardening for ${hardening.packageName} requires review: ` +
          `expected ${hardening.expectedVersion}, found ${version}`
      );
    }

    const sourcePath = resolve(repositoryRoot, packagePath, hardening.relativeFile);
    const source = readFileSync(sourcePath, "utf8");
    if (source.includes(hardening.hardened)) {
      continue;
    }
    if (!source.includes(hardening.vulnerable)) {
      throw new Error(
        `Vendor hardening for ${hardening.packageName} cannot be applied safely: ` +
          `${hardening.relativeFile} has an unknown shape`
      );
    }
    writeFileSync(
      sourcePath,
      source.replace(hardening.vulnerable, hardening.hardened),
      "utf8"
    );
  }

  console.log(
    `Vendor hardening verified: ${hardening.packageName}@${hardening.expectedVersion} ` +
      `(${packagePaths.length} installation${packagePaths.length === 1 ? "" : "s"})`
  );
}
