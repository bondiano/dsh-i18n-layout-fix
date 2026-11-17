/**
 * Isolated Host harness for the UI suite.
 *
 * Every run boots the real `dsh` CLI against a workspace-local `DSH_HOME` and
 * installs this checkout through a loader patch. No token is printed; the URL
 * is used only inside the test process. The Host restart helper keeps the same
 * port and home so the browser keeps its signed auth cookie and reconnects its
 * public `plugins/events` stream — the real trigger of the release dialog.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import type { Page } from "@playwright/test";

export const workspaceRoot = join(import.meta.dirname, "..", "..", "..", "..");
export const packageRoot = join(workspaceRoot, "packages", "dsh-i18n-layout-fix");
export const testHome = join(workspaceRoot, ".artifacts", "e2e-home");
export const pluginPatch = join(workspaceRoot, ".artifacts", "e2e-plugin.patch.yml");

const PROFILE = "e2e";

export interface Host {
  readonly url: string;
  readonly port: number;
  readonly child: ChildProcess;
  restart: () => Promise<void>;
  stop: () => Promise<void>;
}

/** Find a currently free loopback port. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === "string") {
          reject(new Error("no port"));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

/** Create the isolated profile once and link this checkout into it. */
export async function ensureProfile(): Promise<void> {
  const profile = join(testHome, "profiles", PROFILE);
  if (!existsSync(join(profile, "package.json"))) {
    await mkdir(profile, { recursive: true });
    const status = spawnSyncDsh(["--profile", PROFILE, "--from-default-profile", "web", "--help"]);
    if (status !== 0) throw new Error("could not create the isolated DSH profile");
  }
  await resetLocalePreference(profile);
  const link = join(profile, "node_modules", "dsh-i18n-layout-fix");
  await mkdir(join(profile, "node_modules"), { recursive: true });
  await symlink(packageRoot, link, "dir").catch(() => undefined);
  await writeFile(
    pluginPatch,
    "- insert:\n    - id: dsh-i18n-layout-fix\n      name: \"dsh-i18n-layout-fix\"\n",
  );
}

/**
 * Drop a persisted locale preference so every run starts from the browser
 * language. The Host writes the preference into the profile patch layer; a
 * previous corrected-Russian test would otherwise leak into the next file.
 */
async function resetLocalePreference(profile: string): Promise<void> {
  const patchPath = join(profile, "cordis.patch.yml");
  if (!existsSync(patchPath)) return;
  const source = readFileSync(patchPath, "utf8");
  const lines = source.split("\n");
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^- id: locale$/u.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && /^- (id|insert):/u.test(line)) skipping = false;
    if (!skipping) kept.push(line);
  }
  const next = kept.join("\n");
  if (next !== source) await writeFile(patchPath, next);
}

function spawnSyncDsh(args: string[]): number | null {
  try {
    execFileSync("dsh", args, {
      cwd: workspaceRoot,
      env: { ...process.env, DSH_HOME: testHome },
      stdio: "pipe",
    });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
}

function startProcess(port: number, withPlugin: boolean): { child: ChildProcess; url: Promise<string> } {
  const args = ["--profile", PROFILE];
  if (withPlugin) args.push("--patch", pluginPatch);
  args.push("--port", String(port), "--no-open");
  const child = spawn("dsh", args, {
    cwd: workspaceRoot,
    env: { ...process.env, DSH_HOME: testHome },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const url = new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      reject(new Error(`Host did not print a URL: ${output.slice(-2000)}`));
    }, 60_000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = output.match(/dsh web: (\S+)/);
      if (match !== null) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Host exited early (${String(code)}): ${output.slice(-2000)}`));
    });
  });

  return { child, url };
}

/** Boot an isolated Host (with the plugin unless `withPlugin` is false). */
export async function startHost(options: { withPlugin?: boolean } = {}): Promise<Host> {
  await ensureProfile();
  const port = await freePort();
  let hostProcess = startProcess(port, options.withPlugin !== false);
  let url = await hostProcess.url;

  const stopProcess = async (): Promise<void> => {
    if (hostProcess.child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      hostProcess.child.once("exit", () => {
        resolve();
      });
      hostProcess.child.kill("SIGTERM");
    });
  };

  return {
    url,
    port,
    get child() {
      return hostProcess.child;
    },
    async restart() {
      await stopProcess();
      await new Promise((resolve) => setTimeout(resolve, 700));
      hostProcess = startProcess(port, options.withPlugin !== false);
      url = await hostProcess.url;
    },
    stop: stopProcess,
  } as Host;
}

/** Dismiss the first-run/sign-in overlays until no dialog is left. */
export async function dismissOnboarding(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if ((await page.locator('[role="dialog"]').count()) === 0) return;
    const close = page.getByRole("button", {
      name: /Продолжить|Понятно|Начать|Пропустить|Закрыть|Continue|Got it|Start|Skip|Close/i,
    });
    if ((await close.count()) === 0) return;
    await close.last().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
}

/** Load the application and settle the first render. */
export async function openApp(page: Page, host: Host | string): Promise<void> {
  const url = typeof host === "string" ? host : host.url;
  page.setDefaultTimeout(15_000);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(7_000);
  await dismissOnboarding(page);
}

/** Open Settings → General (the account menu is the only shipped entry point). */
export async function openSettings(page: Page): Promise<void> {
  if ((await page.locator('[role="dialog"][data-shortcut-modal="settings"]').count()) === 0) {
    // Below the wide breakpoint the sidebar is collapsed; open it before
    // looking for the account menu.
    if ((await page.getByRole("button", { name: /Меню аккаунта|Account menu/i }).count()) === 0) {
      const expand = page.getByRole("button", { name: /Открыть боковую панель|Open sidebar/i });
      if ((await expand.count()) > 0) {
        await expand.first().click();
        await page.waitForTimeout(500);
      }
    }
    await page.getByRole("button", { name: /Меню аккаунта|Account menu/i }).first().click();
    await page.getByRole("menuitem", { name: /Настройки|Settings/i }).first().click();
  }
  await page.locator('[role="dialog"][data-shortcut-modal="settings"]').waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForTimeout(600);
}

/** The settings dialog root. */
export function settingsDialog(page: Page) {
  return page.locator('[role="dialog"][data-shortcut-modal="settings"]');
}

/**
 * The shipped two-button modal shape: autofocusable control, two direct footer
 * buttons. Other confirmations (models delete, agent-team disable, shortcut
 * reset) share this shape, so it is a superset selector used only to prove the
 * release rule does not apply to them.
 */
export const TWO_BUTTON_DIALOG =
  '[role="dialog"][aria-modal="true"]:not([data-shortcut-modal]):has(button[data-modal-autofocus]):has(> div:last-child > button + button)';

/**
 * The real release-change dialog: the two-button shape plus the release
 * transition body (a grid of spans with decorative `aria-hidden` separators).
 * Keep in sync with `D` in `src/client/layout.css`.
 */
export const UPDATE_DIALOG =
  `${TWO_BUTTON_DIALOG}:has(> div:first-child > div:last-child > div > span[aria-hidden="true"])`;

/** The release-change dialog root. */
export function releaseDialog(page: Page) {
  return page.locator(UPDATE_DIALOG);
}

/** Seed one modified shortcut so the reference dialog exposes reset-all. */
export async function seedShortcutOverride(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "dsh.keybindings.v1",
      JSON.stringify({
        schemaVersion: 1,
        profiles: {
          "web:linux": {
            "shortcuts.open": { code: "F9", modifiers: ["control", "shift"] },
          },
        },
      }),
    );
  });
}

/**
 * Open Settings → General → "Edit shortcuts", then the real reset-all
 * confirmation. This is the shipped reference dialog with two direct footer
 * buttons; it must keep its shipped styling.
 */
export async function openShortcutsResetConfirmation(page: Page) {
  await openSettings(page);
  await page
    .getByRole("button", { name: /Редактировать ярлыки|Edit shortcuts/i })
    .click();
  await page
    .locator('[role="dialog"][data-shortcut-modal="shortcuts"]')
    .waitFor({ state: "visible", timeout: 20_000 });
  await page
    .getByRole("button", {
      name: /Восстановить все настройки по умолчанию|Restore all defaults/i,
    })
    .click();
  const dialog = page.locator(
    '[role="dialog"][aria-modal="true"]:not([data-shortcut-modal])',
  );
  await dialog.waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(200);
  return dialog;
}

/** Check that no text range inside a control ends below the control. */
export async function textClip(
  page: Page,
  selector: string,
): Promise<{ text: string; lines: number; clipped: boolean; insideBox: boolean }[]> {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll<HTMLElement>(sel)].map((element) => {
      const box = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
      const bottom = rects.length === 0 ? box.top : Math.max(...rects.map((rect) => rect.bottom));
      return {
        text: (element.innerText || "").trim(),
        lines: rects.length,
        clipped: bottom > box.bottom + 0.5 || element.scrollHeight > element.clientHeight + 1,
        insideBox:
          rects.every((rect) => rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5),
      };
    });
  }, selector);
}

/** Install the SSE graph-frame trigger used by the update-dialog tests. */
export async function installReleaseFrames(page: Page): Promise<{ arm: () => void }> {
  let requests = 0;
  let armed = false;
  let boot: { release?: Record<string, string> } | null = null;

  await page.route("**/plugins/events", async (route) => {
    if (!armed) {
      requests += 1;
      await route.continue();
      return;
    }
    boot ??= (await page.evaluate(() => {
      const value = (window as { __DSH_BOOT__?: { release?: Record<string, string> } })
        .__DSH_BOOT__;
      return value ?? null;
    })) as { release?: Record<string, string> } | null;
    requests += 1;
    const release = { ...(boot?.release ?? {}), commit: "e2e-next-release" };
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
      body: `data: ${JSON.stringify({ type: "graph", graph: { ...boot, release } })}\n\n`,
    });
  });

  return {
    arm() {
      armed = true;
    },
  };
}

/** Wait until the release dialog is visible after a Host restart. */
export async function waitForReleaseDialog(page: Page): Promise<void> {
  await releaseDialog(page).waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(300);
}

/** Read `window.__DSH_BOOT__` for diagnostics. */
export async function bootRelease(page: Page): Promise<unknown> {
  return page.evaluate(() => (window as { __DSH_BOOT__?: unknown }).__DSH_BOOT__);
}
