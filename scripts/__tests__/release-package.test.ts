/**
 * Installable-bundle contract: manifest, patch, plugin metadata, built
 * artifacts, inlined stylesheet, and the exact tarball file list.
 *
 * The tarball is produced by `npm pack --dry-run --json`, so the assertion is
 * about what a user actually receives rather than the checkout.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const packScratch = join(tmpdir(), `dsh-pack-${String(process.pid)}`);
const read = (path: string): Promise<string> => readFile(join(packageRoot, path), "utf8");
const json = async <T>(path: string): Promise<T> => JSON.parse(await read(path)) as T;

interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  type: string;
  icon?: string;
  engines?: Record<string, string>;
  exports: Record<string, unknown>;
  files: string[];
  dsh?: {
    bundle?: { patch?: string };
    client?: { platform?: string; inject?: string[]; immediately?: boolean };
  };
  meta?: { title?: string; description?: string };
}

interface PackResult {
  files: { path: string }[];
}

describe("release package dsh-i18n-layout-fix", () => {
  let manifest: Manifest;

  beforeAll(async () => {
    manifest = await json<Manifest>("package.json");
    const build = spawnSync(process.execPath, ["scripts/build.ts"], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    if (build.status !== 0) {
      throw new Error(`build failed: ${build.stdout}\n${build.stderr}`);
    }
  }, 120_000);

  it("declares the bundle identity, private flag and DSH range", () => {
    expect(manifest.name).toBe("dsh-i18n-layout-fix");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe("module");
    expect(manifest.engines).toEqual({ dsh: ">=0.2.2-rc.3 <0.3.0", node: ">=24" });
    expect(manifest.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
    expect(manifest.dsh?.client).toMatchObject({ platform: "web", immediately: true });
    expect(manifest.dsh?.client?.inject).toEqual([
      "@deepseek-ai/dsh-client-ui-renderer",
      "@deepseek-ai/dsh-client-ui-settings",
      "@deepseek-ai/dsh-client-locale",
    ]);
  });

  it("exports only files that exist", () => {
    for (const target of Object.values(manifest.exports)) {
      const file = typeof target === "string"
        ? target
        : (target as { default?: string }).default;
      if (file === undefined || file.includes("*")) continue;
      expect(existsSync(join(packageRoot, file)), file).toBe(true);
    }
    expect(manifest.icon).toBe("./icon.svg");
    expect(existsSync(join(packageRoot, "icon.svg"))).toBe(true);
  });

  it("mounts one patch row and keeps the row id stable", async () => {
    const patch = await read("cordis.patch.yml");
    expect(patch).toMatch(/^- insert:/m);
    expect(patch).toMatch(/^ {4}- id: dsh-i18n-layout-fix$/m);
    expect(patch).toContain('name: "dsh-i18n-layout-fix"');
    expect(patch).not.toMatch(/^ {0,2}- id: dsh-i18n-layout-fix$/m);
  });

  it("ships metadata for Plugin Manager in both locales", async () => {
    for (const locale of ["en", "ru"]) {
      const meta = await json<{ meta: Record<string, string> }>(
        `locale/${locale}.json`,
      );
      expect(meta.meta.title?.length, locale).toBeGreaterThan(3);
      expect(meta.meta.description?.length, locale).toBeGreaterThan(20);
      expect(meta.meta.detail).toBe("docs/COMPATIBILITY.md");
      expect(existsSync(join(packageRoot, meta.meta.detail)), locale).toBe(true);
    }
  });

  it("builds Host ESM and one lazy Client chunk with the stylesheet inlined", async () => {
    const host = await read("lib/index.js");
    const client = await read("lib/client.js");
    const graph = await json<{
      externals: string[];
      modules: string[];
      dynamicImports: string[];
      chunks: string[];
    }>("lib/client.graph.json");

    expect(host).toContain("export {");
    expect(host).not.toContain('from "react"');
    expect(client.startsWith("window.__ModuleLoader__.load(")).toBe(true);
    expect(client).toContain("data-dsh-i18n-layout-fix-row");
    expect(client).toContain("data-shortcut-modal");
    expect(client).toContain("div:first-child > div:last-child > div > span");
    expect(client).toContain("max-block-size: calc(100dvh - 1rem)");
    expect(client).not.toMatch(/require\("@deepseek-ai\//);
    expect(graph.externals).toEqual(["react"]);
    expect(graph.chunks).toEqual(["client.js"]);
    expect(graph.dynamicImports).toEqual([]);
    expect(graph.modules).toContain("src/client/index.ts");
    expect(graph.modules).toContain("src/client/StatusRow.tsx");
    expect(graph.modules).toContain("src/domain/machines/install.machine.ts");
    expect(graph.modules.some((module) => module.startsWith("node_modules/xstate/"))).toBe(true);
    expect(client).not.toContain('require("xstate")');
    expect(graph.modules.every((module) =>
      module.startsWith("src/client/")
      || module.startsWith("src/domain/")
      || module.startsWith("node_modules/"),
    )).toBe(true);

    const files = await readdir(join(packageRoot, "lib"));
    expect(files.some((file) => file.endsWith(".css"))).toBe(false);
  });

  afterAll(async () => {
    await rm(packScratch, { recursive: true, force: true });
  });

  it("keeps the packed tarball limited to runtime files", () => {
    const packed = spawnSync(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      {
        cwd: packageRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_cache: join(packScratch, "cache"),
          npm_config_logs_dir: join(packScratch, "logs"),
          npm_config_update_notifier: "false",
        },
      },
    );
    if (packed.status !== 0) {
      throw new Error(`npm pack failed: ${packed.stderr}`);
    }
    const parsed = JSON.parse(packed.stdout) as PackResult[] | Record<string, PackResult>;
    // npm < 11 returns an array, npm >= 11 an object keyed by package name.
    const result = Array.isArray(parsed) ? parsed : Object.values(parsed);
    const paths = result[0]?.files.map((file) => file.path) ?? [];

    expect(paths).toContain("lib/index.js");
    expect(paths).toContain("lib/client.js");
    expect(paths).toContain("lib/client.graph.json");
    expect(paths).toContain("src/client/layout.css");
    expect(paths).toContain("src/client/locales/ru.json");
    expect(paths).toContain("cordis.patch.yml");
    expect(paths).toContain("docs/COMPATIBILITY.md");
    expect(paths).toContain("locale/ru.json");
    expect(paths).toContain("icon.svg");

    expect(paths.some((path) => path.includes("__tests__"))).toBe(false);
    expect(paths.some((path) => path.startsWith("tests/"))).toBe(false);
    expect(paths.some((path) => path.endsWith(".tsbuildinfo"))).toBe(false);
  }, 120_000);
});
