declare const __dirname: string;
export {};

const { readFileSync } = require("fs") as {
  readFileSync(filePath: string, encoding: "utf8"): string;
};
const { resolve } = require("path") as { resolve(...parts: string[]): string };

const repositoryRoot = resolve(__dirname, "../..");
const dependabotPolicy = readFileSync(resolve(repositoryRoot, ".github/dependabot.yml"), "utf8");

const sdkControlledDependencies = [
  "expo",
  "expo-*",
  "@expo/*",
  "react",
  "react-dom",
  "react-native",
  "react-native-*",
  "@react-native/*",
  "@react-native-community/*",
  "@react-navigation/*",
  "lucide-react-native",
  "moti",
  "@types/react",
  "jest-expo",
  "react-test-renderer"
];

describe("Dependabot mobile SDK guardrails", () => {
  it("keeps every SDK-coupled dependency out of unattended version PRs", () => {
    const ignoredDependencies = dependabotPolicy
      .split("\n")
      .map((line) => line.match(/^\s*- dependency-name: "([^"]+)"$/)?.[1])
      .filter((dependency): dependency is string => dependency !== undefined);

    for (const dependency of sdkControlledDependencies) {
      expect(ignoredDependencies).toContain(dependency);
    }
  });

  it("does not reintroduce an Expo update group that can mix incompatible SDK generations", () => {
    expect(dependabotPolicy).not.toMatch(/^\s+expo-sdk:$/m);
  });

  it("continues to block every unattended major update", () => {
    expect(dependabotPolicy).toContain('- dependency-name: "*"');
    expect(dependabotPolicy).toContain("update-types: [version-update:semver-major]");
  });
});
