import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export function loadFlowManifest(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const names = manifest?.flows;
  if (manifest?.version !== 1 || !Number.isSafeInteger(manifest?.expectedCount) ||
      manifest.expectedCount < 1 || !Array.isArray(names) ||
      names.length !== manifest.expectedCount) {
    throw new Error("Invalid Maestro flow manifest structure or expectedCount.");
  }
  if (names.some((name) => typeof name !== "string" ||
      !/^[0-9]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) ||
      new Set(names).size !== names.length) {
    throw new Error("Maestro flow manifest contains invalid or duplicate names.");
  }
  return Object.freeze([...names]);
}

export function verifyFlowDirectory(manifestNames, flowDirectory) {
  const actualNames = readdirSync(flowDirectory)
    .filter((entry) => entry.endsWith(".yaml"))
    .map((entry) => basename(entry, ".yaml"))
    .sort();
  const expectedNames = [...manifestNames].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error("Maestro flow files do not match the checked-in manifest.");
  }

  for (const name of manifestNames) {
    const source = readFileSync(join(flowDirectory, name + ".yaml"), "utf8");
    const declaredName = source.match(/^name:\s*([^\r\n]+?)\s*$/m)?.[1];
    if (declaredName !== name) {
      throw new Error("Maestro flow " + name + " declares a different name.");
    }
  }
}
