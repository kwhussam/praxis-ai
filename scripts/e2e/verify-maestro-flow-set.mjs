import { loadFlowManifest, verifyFlowDirectory } from "./maestro-flow-manifest.mjs";

const [manifestPath, flowDirectory] = process.argv.slice(2);
if (!manifestPath || !flowDirectory) {
  throw new Error("Usage: verify-maestro-flow-set.mjs <manifest.json> <flow-directory>");
}

const manifestNames = loadFlowManifest(manifestPath);
verifyFlowDirectory(manifestNames, flowDirectory);
// The shell runner takes its expected count only from the validated manifest.
console.log(manifestNames.length);
