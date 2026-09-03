#!/usr/bin/env node

// Builds the expo-development-client deep link for the smoke runner.
//
// The Metro URL is a query parameter, so it must be percent-encoded. Doing that by hand in the
// shell silently breaks as soon as the host is an IPv6 literal (the colons and brackets need
// encoding) or the port comes from an environment variable. encodeURIComponent handles both.

const [scheme, host, port] = process.argv.slice(2);

if (!scheme || !host || !port) {
  console.error("Usage: dev-client-url.mjs <app-scheme> <metro-host> <metro-port>");
  process.exit(1);
}

if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error(`Invalid Metro port: ${port}`);
  process.exit(1);
}

// An IPv6 literal must be bracketed inside a URL authority before it is encoded.
const authority = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
const metroUrl = `http://${authority}:${port}`;

process.stdout.write(
  `${scheme}://expo-development-client/?url=${encodeURIComponent(metroUrl)}\n`
);
