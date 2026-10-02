// Post-build: moderate obfuscation of emitted .js, run after tsup.
// Usage: node ../../scripts/obfuscate.mjs <distDir>
//
// Safe to encode className strings now that components ship their CSS pre-compiled
// (dist/styles.css): the app no longer scans this JS, and obfuscated strings decode
// back to the same class names at runtime. We still strip/re-prepend "use client"
// by hand so a client component does not silently become a server component.
// Moderate = string-array encoding + identifier renaming, NO control-flow
// flattening / self-defending / dead-code (perf + React safety).
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JsObfuscator = require("javascript-obfuscator");

const distDir = path.resolve(process.argv[2] ?? "dist");

const options = {
  compact: true,
  identifierNamesGenerator: "mangled-shuffled",
  renameGlobals: false,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.8,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: false,
  simplify: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  numbersToExpressions: false,
  transformObjectKeys: false, // would rename prop keys -> breaks React
  unicodeEscapeSequence: false,
};

const USE_CLIENT = /^\s*(["'])use client\1\s*;?\s*/;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith(".js")) yield full;
  }
}

let count = 0;
for await (const file of walk(distDir)) {
  const original = await readFile(file, "utf8");
  const hadUseClient = USE_CLIENT.test(original);
  const body = hadUseClient ? original.replace(USE_CLIENT, "") : original;

  const result = JsObfuscator.obfuscate(body, options).getObfuscatedCode();
  const out = hadUseClient ? `"use client";\n${result}` : result;

  await writeFile(file, out);
  count++;
}

console.log(`obfuscated ${count} file(s) in ${path.relative(process.cwd(), distDir) || distDir}`);
