import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

/** Resolve a Chromium binary without requiring a write into the home cache. */
function chromiumExecutable(): string | undefined {
  const explicit = process.env.DSH_CHROMIUM_PATH;
  if (explicit !== undefined && explicit !== "") return explicit;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH
    ?? join(process.env.HOME ?? "", ".cache", "ms-playwright");
  try {
    const revisions = readdirSync(cache)
      .filter((entry) => entry.startsWith("chromium-"))
      .sort()
      .reverse();
    for (const revision of revisions) {
      const candidate = join(cache, revision, "chrome-linux64", "chrome");
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // Fall back to Playwright's own resolution.
  }
  return undefined;
}

const executablePath = chromiumExecutable();

export default defineConfig({
  testDir: "./tests/ui",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    locale: "ru-RU",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      ...(executablePath === undefined ? {} : { executablePath }),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
