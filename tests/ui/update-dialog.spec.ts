/**
 * The real update-release dialog.
 *
 * The page boots from one Host release, the Host is restarted on the same port
 * and `DSH_HOME`, and the next public `plugins/events` graph frame (only
 * `release.commit` changed) makes `ReleaseChangeGate` announce the change. The
 * dialog is the shipped `HostReleasePrompt`; no fake dialog and no Desktop
 * download/install path is exercised.
 */
import { expect, test as base } from "@playwright/test";

import {
  installReleaseFrames,
  openApp,
  openSettings,
  releaseDialog,
  settingsDialog,
  startHost,
  textClip,
  waitForReleaseDialog,
  type Host,
} from "./helpers.ts";

// Each test owns a Host: a release change deliberately restarts it, and a
// shared process would leak authentication/profile state into the next test.
const test = base.extend<{ host: Host }>({
  host: async ({}, use) => {
    const host = await startHost();
    await use(host);
    await host.stop();
  },
});

test("Russian update dialog keeps both long buttons readable", async ({ page, host }) => {
  await page.addInitScript(() => {
    window.addEventListener("dsh-test-invalid", () => undefined);
  });
  const frames = await installReleaseFrames(page);
  await openApp(page, host);

  await expect
    .poll(() => page.locator("style[data-dsh-i18n-layout-fix]").count())
    .toBe(1);

  frames.arm();
  await host.restart();
  await waitForReleaseDialog(page);

  const dialog = releaseDialog(page);
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toHaveAttribute("aria-label", /Версия сервиса изменена|Service version changed/);

  const buttons = dialog.locator(":scope > div:last-child > button");
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveText("Не сейчас");
  await expect(buttons.nth(1)).toHaveText("Перезагрузите, чтобы загрузить новую версию");

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.height).toBeLessThanOrEqual(viewport!.height);

  const control = await textClip(page, ':scope > div:last-child > button');
  for (const entry of control) {
    expect(entry.clipped, `${entry.text} (${String(entry.lines)} lines)`).toBe(false);
  }

  const geometry = await page.evaluate(() => {
    const root = document.querySelector('[role="dialog"][aria-modal="true"]')!;
    const dialog = root.getBoundingClientRect();
    return [...root.querySelectorAll<HTMLElement>(':scope > div:last-child > button')].map(
      (button) => {
        const rect = button.getBoundingClientRect();
        return {
          text: (button.innerText || "").trim(),
          width: rect.width,
          height: rect.height,
          inside:
            rect.left >= dialog.left - 0.5 &&
            rect.right <= dialog.right + 0.5 &&
            rect.top >= dialog.top - 0.5 &&
            rect.bottom <= dialog.bottom + 0.5,
          whiteSpace: getComputedStyle(button).whiteSpace,
          overflowWrap: getComputedStyle(button).overflowWrap,
        };
      },
    );
  });

  for (const button of geometry) {
    expect(button.inside, button.text).toBe(true);
    expect(button.whiteSpace, button.text).toBe("normal");
    expect(button.overflowWrap, button.text).toBe("anywhere");
  }
  // The long Russian label wraps to at least two lines and the button grows
  // beyond the shipped 36px height instead of clipping.
  expect(geometry.every((button) => button.height >= 35)).toBe(true);
  expect(Math.max(...geometry.map((button) => button.height))).toBeGreaterThan(36);

  // Safe initial focus: keeping the page, not reloading it.
  const focused = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    return {
      text: (element?.innerText || "").trim(),
      autofocus: element?.hasAttribute("data-modal-autofocus") ?? false,
    };
  });
  expect(focused.autofocus).toBe(true);
  expect(focused.text).toBe("Не сейчас");

  // At a short viewport the content column becomes the scroll owner and the
  // action row stays visible instead of being clipped by the dialog.
  await page.setViewportSize({ width: 1440, height: 240 });
  const short = await dialog.evaluate((root) => {
    const dialogBox = root.getBoundingClientRect();
    const content = root.querySelector<HTMLElement>(":scope > div:first-child")!;
    const footer = root.querySelector<HTMLElement>(":scope > div:last-child")!;
    return {
      dialogHeight: dialogBox.height,
      overflowY: getComputedStyle(content).overflowY,
      scrollHeight: content.scrollHeight,
      clientHeight: content.clientHeight,
      footerBottom: footer.getBoundingClientRect().bottom,
      dialogBottom: dialogBox.bottom,
    };
  });
  expect(short.dialogHeight).toBeLessThanOrEqual(240);
  expect(short.overflowY).toBe("auto");
  expect(short.scrollHeight).toBeGreaterThan(short.clientHeight);
  expect(short.footerBottom).toBeLessThanOrEqual(short.dialogBottom + 0.5);
});

test("Escape dismisses the dialog without reloading the page", async ({ page, host }) => {
  const frames = await installReleaseFrames(page);
  await openApp(page, host);
  frames.arm();
  await host.restart();
  await waitForReleaseDialog(page);

  let navigations = 0;
  page.on("framenavigated", () => {
    navigations += 1;
  });

  await page.keyboard.press("Escape");
  await expect(releaseDialog(page)).toHaveCount(0);
  await page.waitForTimeout(1_500);
  expect(navigations).toBe(0);
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
});

test("the reload action navigates exactly once and downloads nothing", async ({ page, host }) => {
  const downloads: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/desktop|electron|update\/download|installer/i.test(url)) downloads.push(url);
  });

  const frames = await installReleaseFrames(page);
  await openApp(page, host);
  frames.arm();
  await host.restart();
  await waitForReleaseDialog(page);

  let navigations = 0;
  page.on("framenavigated", () => {
    navigations += 1;
  });

  await releaseDialog(page).locator(":scope > div:last-child > button").nth(1).click();
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
  await page.waitForTimeout(1_000);

  expect(navigations).toBe(1);
  expect(downloads).toEqual([]);
  // The harness keeps serving a different release on every reconnect, so the
  // reloaded page may legitimately announce it again. Dismiss it before the
  // final absence assertion; what matters is the single navigation above.
  await page.unroute("**/plugins/events");
  if ((await releaseDialog(page).count()) > 0) await page.keyboard.press("Escape");
  await expect(releaseDialog(page)).toHaveCount(0);
});

test("corrected Russian language changes the dialog label through the official locale API", async ({ page, host }) => {
  const frames = await installReleaseFrames(page);
  await openApp(page, host);
  await openSettings(page);

  const row = page.locator("[data-dsh-i18n-layout-fix-row]");
  await expect(row).toHaveCount(1);
  await expect(page.locator("[data-dsh-i18n-layout-fix-description]")).toHaveText(
    /доступен исправленный русский язык/iu,
  );

  await row.getByRole("button", { name: "Включить исправленный русский" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(
    "ru-x-dshfix",
  );
  await expect(page.locator("[data-dsh-i18n-layout-fix-description]")).toHaveText(
    "Исправленный русский язык включён.",
  );

  await expect(settingsDialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settingsDialog(page)).toHaveCount(0);

  frames.arm();
  await host.restart();
  await waitForReleaseDialog(page);

  const buttons = releaseDialog(page).locator(":scope > div:last-child > button");
  await expect(buttons.nth(0)).toHaveText("Не сейчас");
  await expect(buttons.nth(1)).toHaveText("Перезагрузить страницу");
  // The corrected copy uses the promoted built-in Russian for everything else.
  await expect(releaseDialog(page)).toContainText("Сервис");
  await expect(releaseDialog(page)).toContainText("Страница");
});
