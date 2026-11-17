import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

const root = fileURLToPath(new URL(".", import.meta.url));

const { name } = JSON.parse(
  readFileSync(new URL("package.json", import.meta.url), "utf8"),
) as { name: string };

/** Inline `*.css?raw` imports as a JavaScript string module. */
function inlineCssPlugin() {
  return {
    name: "inline-layout-css",
    load(id: string) {
      if (!id.endsWith(".css?raw")) return null;
      const file = id.slice(0, -"?raw".length);
      return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
    },
  };
}

/**
 * Host build: ordinary ESM for Node with no bundled dependencies.
 *
 * Client build: one CJS chunk in the Harness lazy module-table format. React and
 * react-dom stay external; the stylesheet is inlined so the browser needs no
 * separate CSS asset and the plugin can remove exactly one style node.
 */
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    platform: "node",
    format: "esm",
    target: "es2022",
    tsconfig: "tsconfig.host.json",
    outDir: "lib",
    outExtensions: () => ({ js: ".js" }),
    clean: false,
    dts: false,
    deps: { neverBundle: true },
  },
  {
    entry: { client: "src/client/index.ts" },
    platform: "browser",
    format: "cjs",
    target: "es2022",
    tsconfig: "tsconfig.client.json",
    outDir: "lib",
    outExtensions: () => ({ js: ".js" }),
    clean: false,
    dts: false,
    deps: { neverBundle: ["react", "react-dom"], alwaysBundle: ["xstate"] },
    inputOptions: { platform: "browser" },
    banner: `window.__ModuleLoader__.load({id:${JSON.stringify(name)},factory(require){const exports = {}; const module = { exports };`,
    footer: "return module.exports; }});",
    outputOptions: { exports: "named", codeSplitting: false },
    plugins: [
      inlineCssPlugin(),
      {
        name: "verify-client-graph",
        generateBundle(_options, bundle) {
          const externals: string[] = [];
          const modules: string[] = [];

          for (const id of this.getModuleIds()) {
            const info = this.getModuleInfo(id);

            if (info?.code === null) {
              if (id !== "react" && id !== "react-dom") {
                throw new Error(`Unsupported Client external: ${id}`);
              }
              externals.push(id);
              continue;
            }

            const local = relative(root, id).replaceAll("\\", "/");
            const isSource =
              local.startsWith("src/client/") ||
              local.startsWith("src/domain/");
            // Bundled dependencies (xstate) are part of the self-contained chunk.
            const isDependency = id.includes("/node_modules/");

            if ((!isSource && !isDependency) || local.includes("/__tests__/")) {
              throw new Error(`Non-Client module in browser graph: ${id}`);
            }

            modules.push(local);
          }

          if (!modules.includes("src/client/index.ts")) {
            throw new Error("Client graph is missing src/client/index.ts");
          }

          const chunks = Object.values(bundle).filter(
            (item) => item.type === "chunk",
          );
          const dynamicImports = chunks.flatMap((chunk) => chunk.dynamicImports);

          if (chunks.length !== 1 || dynamicImports.length !== 0) {
            throw new Error("Client must be one self-contained chunk");
          }

          this.emitFile({
            type: "asset",
            fileName: "client.graph.json",
            source:
              JSON.stringify(
                {
                  externals: externals.sort(),
                  modules: modules.sort(),
                  dynamicImports,
                  chunks: chunks.map((chunk) => chunk.fileName),
                },
                null,
                2,
              ) + "\n",
          });
        },
      },
    ],
  },
]);
