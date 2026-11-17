/**
 * Build `dsh-i18n-layout-fix`: clear `lib`, run tsdown, verify the bundle
 * contract before the package can be installed.
 *
 * The checks mirror the Harness client-module rules: Host ESM without bundled
 * dependencies, exactly one lazy Client chunk externalizing only React, the
 * stylesheet inlined (no CSS asset the loader would have to fetch), and a graph
 * limited to `src/client/`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const lib = join(packageRoot, "lib");

await rm(lib, { recursive: true, force: true });

const tsdown = join(
  packageRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsdown.cmd" : "tsdown",
);
const result = spawnSync(tsdown, [], {
  cwd: packageRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  throw new Error(
    `tsdown failed with exit code ${String(result.status ?? "signal")}`,
  );
}

const required = ["index.js", "client.js", "client.graph.json"] as const;
const missing = required.filter((file) => !existsSync(join(lib, file)));

if (missing.length > 0) {
  throw new Error(`release build is missing artifacts: ${missing.join(", ")}`);
}

const client = await readFile(join(lib, "client.js"), "utf8");

if (!client.startsWith("window.__ModuleLoader__.load(")) {
  throw new Error("client.js is not a Harness lazy-module bundle");
}

if (client.includes('require("@deepseek-ai/')) {
  throw new Error("client.js must not require another DSH client package");
}

if (client.includes('require("xstate")')) {
  throw new Error("client.js must bundle xstate, not require it");
}

if (!client.includes("data-dsh-i18n-layout-fix-row") || !client.includes("text-overflow: clip")) {
  throw new Error("client.js does not carry the inlined layout stylesheet");
}

const emitted = await readdir(lib);
if (emitted.some((file) => file.endsWith(".css"))) {
  throw new Error("the Client build must inline layout.css, not emit a CSS asset");
}

const graph = JSON.parse(
  await readFile(join(lib, "client.graph.json"), "utf8"),
) as {
  externals: string[];
  modules: string[];
  dynamicImports: string[];
  chunks: string[];
};

const allowedExternals = new Set(["react", "react-dom"]);

if (
  !graph.externals.includes("react") ||
  graph.externals.some((name) => !allowedExternals.has(name))
) {
  throw new Error(
    `client externals must be a subset of react/react-dom, got ${graph.externals.join(", ")}`,
  );
}

if (graph.chunks.length !== 1 || graph.chunks[0] !== "client.js") {
  throw new Error(`client chunks must be [client.js], got ${graph.chunks.join(", ")}`);
}

if (graph.dynamicImports.length !== 0) {
  throw new Error("client bundle must not use dynamic imports");
}

if (!graph.modules.includes("src/client/index.ts")) {
  throw new Error("client graph is missing src/client/index.ts");
}

console.log(
  `built dsh-i18n-layout-fix: ${required.join(", ")} (client externals: ${graph.externals.join(", ")})`,
);
