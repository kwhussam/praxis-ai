declare const __dirname: string;

type DirEntry = {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
};

const fs = require("fs") as {
  readdirSync(dir: string, options: { withFileTypes: true }): DirEntry[];
  readFileSync(filePath: string, encoding: "utf8"): string;
};

const path = require("path") as {
  basename(filePath: string): string;
  extname(filePath: string): string;
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  resolve(...parts: string[]): string;
};

const repoRoot = path.resolve(__dirname, "../..");

const ignoredDirs = new Set([".git", ".expo", ".wrangler", "node_modules", "dist", "build", "ios", "android"]);
const textExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".toml",
  ".ts",
  ".tsx",
  ".yml",
  ".yaml"
]);

const allowedPublicEnvNames = new Set([
  "EXPO_PUBLIC_API_BASE_URL",
  "EXPO_PUBLIC_APP_ENV",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_SUPABASE_URL"
]);

const privilegedPublicNamePattern =
  /EXPO_PUBLIC_.*(SERVICE|SERVICE_ROLE|ROLE|SECRET|TOKEN|PASSWORD|PRIVATE|ANTHROPIC|SHODAN|HIBP|MXTOOLBOX|VIRUSTOTAL|RESEND|DATA_ENCRYPTION)/i;

const secretLogPattern =
  /(console\.(?:debug|error|info|log|warn)|logger\.(?:debug|error|info|warn))\(.*(?:authorization|apikey|api-key|x-api-key|bearer|cookie|headers?|secret|token|password|service_role|anthropic|shodan|hibp|mxtoolbox|virustotal|resend|data_encryption|env|req|request)/i;

const upstreamErrorDetailsPattern = /Response\.json\(\s*\{[^}]*error:\s*["'][a-z0-9_]+["'][^}]*details:\s*(?:data|error|response)/is;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredDirs.has(entry.name)) return [];

    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(absolutePath);
    if (!entry.isFile()) return [];
    if (entry.name.startsWith(".env")) return [absolutePath];
    if (textExtensions.has(path.extname(entry.name))) return [absolutePath];
    return [];
  });
}

function relative(filePath: string) {
  return path.relative(repoRoot, filePath);
}

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function envNamesFromEnvFiles() {
  return walk(repoRoot)
    .filter((filePath) => path.basename(filePath).startsWith(".env"))
    .flatMap((filePath) =>
      read(filePath)
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .map((line) => line.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=/)?.[1])
        .filter((name): name is string => Boolean(name))
        .map((name) => ({ filePath, name }))
    );
}

describe("secret exposure guardrails", () => {
  it("blocks privileged secrets from EXPO_PUBLIC variables", () => {
    const publicNames = envNamesFromEnvFiles().filter(({ name }) => name.startsWith("EXPO_PUBLIC_"));
    const disallowedNames = publicNames.filter(
      ({ name }) => !allowedPublicEnvNames.has(name) || privilegedPublicNamePattern.test(name)
    );

    expect(disallowedNames.map(({ filePath, name }) => `${relative(filePath)}:${name}`)).toEqual([]);
  });

  it("keeps mobile bundle code limited to EXPO_PUBLIC environment variables", () => {
    const clientRoots = ["app", "components", "hooks", "lib"];
    const clientFiles = walk(repoRoot).filter((filePath) => {
      const rel = relative(filePath);
      return clientRoots.some((root) => rel.startsWith(`${root}/`)) && !rel.includes("/__tests__/");
    });

    const nonPublicEnvReads = clientFiles.flatMap((filePath) => {
      const matches = read(filePath).matchAll(/process\.env\.([A-Z0-9_]+)/g);
      return Array.from(matches)
        .map((match: RegExpMatchArray) => match[1])
        .filter((name) => !name.startsWith("EXPO_PUBLIC_"))
        .map((name) => `${relative(filePath)}:${name}`);
    });

    expect(nonPublicEnvReads).toEqual([]);
  });

  it("does not log headers, tokens, keys, or request objects in worker/backend code", () => {
    const backendRoots = ["workers/hono/src", "supabase/functions"];
    const backendFiles = walk(repoRoot).filter((filePath) => {
      const rel = relative(filePath);
      return backendRoots.some((root) => rel.startsWith(`${root}/`));
    });

    const riskyLogs = backendFiles.flatMap((filePath) =>
      read(filePath)
        .split(/\r?\n/)
        .map((line: string, index: number) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => secretLogPattern.test(line))
        .map(({ lineNumber }) => `${relative(filePath)}:${lineNumber}`)
    );

    expect(riskyLogs).toEqual([]);
  });

  it("does not return raw upstream provider errors from backend code", () => {
    const backendRoots = ["workers/hono/src", "supabase/functions"];
    const leakingFiles = walk(repoRoot)
      .filter((filePath) => {
        const rel = relative(filePath);
        return backendRoots.some((root) => rel.startsWith(`${root}/`));
      })
      .filter((filePath) => upstreamErrorDetailsPattern.test(read(filePath)))
      .map(relative);

    expect(leakingFiles).toEqual([]);
  });
});
