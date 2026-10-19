#!/usr/bin/env node
/*
  VERIFICATION: every runtime dependency the backend needs at runtime must
  (a) be declared in backend/package.json "dependencies", and
  (b) actually exist in backend/node_modules.

  The Electron installer copies backend/ (including whatever node_modules
  happens to contain) into resources/backend. If a module is missing on the
  build machine it is silently missing in the installed app — that is how
  "Cannot find module 'jalaali-js'" reached production. This script makes
  the build fail loudly instead. Run automatically by npm run dist:win.
*/

const fs = require("fs");
const path = require("path");

const backendDir = path.join(__dirname, "..", "backend");
const srcDir = path.join(backendDir, "src");

const pkg = JSON.parse(
  fs.readFileSync(path.join(backendDir, "package.json"), "utf8"),
);

const declared = Object.keys(pkg.dependencies || {});
const problems = [];

/* (a) every declared dependency must exist on disk */
for (const dep of declared) {
  const depDir = path.join(backendDir, "node_modules", ...dep.split("/"));

  if (!fs.existsSync(path.join(depDir, "package.json"))) {
    problems.push(`declared but NOT installed: ${dep}`);
  }
}

/* (b) every bare require() in backend/src must be declared or builtin */
const builtins = new Set(require("module").builtinModules);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".cjs")) {
      yield full;
    }
  }
}

const requireRe = /require\(\s*["']([^."'][^"']*)["']\s*\)/g;

const undeclared = new Set();

for (const file of walk(srcDir)) {
  const code = fs.readFileSync(file, "utf8");

  for (const match of code.matchAll(requireRe)) {
    const spec = match[1];
    const name = spec.startsWith("@")
      ? spec.split("/").slice(0, 2).join("/")
      : spec.split("/")[0];

    if (builtins.has(name) || declared.includes(name)) {
      continue;
    }

    undeclared.add(`${name} (used in ${path.relative(backendDir, file)})`);
  }
}

for (const entry of undeclared) {
  problems.push(`used but NOT declared in backend/package.json: ${entry}`);
}

if (problems.length) {
  console.error("BACKEND DEPENDENCY CHECK FAILED:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\nRun: npm --prefix backend install --omit=dev   (then re-check)",
  );
  process.exit(1);
}

console.log(
  `Backend dependency check OK: ${declared.length} declared dependencies all installed; no undeclared runtime requires.`,
);
