import { defineConfig } from "vitest/config";

/**
 * The real `LocaleRuntime` is imported from the installed package's `src` entry.
 * Its only UI imports (`LanguageRow.tsx`, `settings-store.ts`) are replaced with
 * inert stubs: the runtime registry itself is the subject of these tests and
 * must not be mocked. Selector and stylesheet rules are tested against the
 * real DOM shapes captured from the running Harness.
 */
function stubLocaleUi() {
  return {
    name: "stub-locale-ui",
    enforce: "pre" as const,
    resolveId(id: string) {
      if (id.endsWith("/LanguageRow.tsx") || id.endsWith("/settings-store.ts")) {
        return `\0locale-ui-stub:${id.split("/").pop()}`;
      }
      return null;
    },
    load(id: string) {
      // Match on the marker: Vite may re-encode the `\0` prefix before `load`.
      if (!id.includes("locale-ui-stub:")) return null;
      if (id.endsWith("LanguageRow.tsx")) {
        return "export function LanguageRow() { return null; }";
      }
      return [
        "export function createLanguageRowStore() {",
        "  return { getSnapshot: () => ({ active: 'en', options: [], revision: 0 }),",
        "    subscribe: () => () => {}, sync: () => {} };",
        "}",
      ].join("\n");
    },
  };
}

export default defineConfig({
  plugins: [stubLocaleUi()],
  test: {
    include: [
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
      "scripts/__tests__/**/*.test.ts",
    ],
    environment: "node",
    css: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
