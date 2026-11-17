/**
 * Settings-navigation and viewport matrix for the scoped stylesheet.
 *
 * Every assertion reads computed styles from the real rendered application:
 * 320/480/768/1440 CSS px, DPR 2, a 200% zoom-equivalent (720×450 at DPR 2),
 * and a 200% text scale. The plugin's own settings row is measured too.
 */
import { expect, test } from "@playwright/test";

import {
  openApp,
  openSettings,
  settingsDialog,
  startHost,
  type Host,
} from "./helpers.ts";

let host: Host;

test.beforeAll(async () => {
  host = await startHost();
});

test.afterAll(async () => {
  await host.stop();
});

interface LabelMeasurement {
  text: string;
  cellHeight: number;
  whiteSpace: string;
  overflow: string;
  textOverflow: string;
  clipped: boolean;
}

async function navLabels(page: import("@playwright/test").Page): Promise<LabelMeasurement[]> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][data-shortcut-modal="settings"]');
    if (dialog === null) throw new Error("settings dialog is not open");
    return [...dialog.querySelectorAll<HTMLElement>(":scope > nav > div > button")].map((cell) => {
      const label = cell.querySelector<HTMLElement>(":scope > span:last-child");
      if (label === null) throw new Error("nav label is missing");
      const style = getComputedStyle(label);
      return {
        text: label.textContent ?? "",
        cellHeight: cell.getBoundingClientRect().height,
        whiteSpace: style.whiteSpace,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        clipped: label.scrollWidth > label.clientWidth + 1,
      };
    });
  });
}

async function expectNoPageOverflow(page: import("@playwright/test").Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
}

for (const width of [320, 480, 768, 1440]) {
  test(`settings dialog wraps Russian labels at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page, host);
    await openSettings(page);

    const dialog = settingsDialog(page);
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);

    const labels = await navLabels(page);
    expect(labels.length).toBeGreaterThanOrEqual(4);
    for (const label of labels) {
      expect(label.whiteSpace, label.text).toBe("normal");
      expect(label.overflow, label.text).toBe("visible");
      expect(label.textOverflow, label.text).toBe("clip");
      expect(label.clipped, `${label.text} is truncated`).toBe(false);
      expect(label.cellHeight, label.text).toBeGreaterThanOrEqual(35);
    }

    // The two Russian labels that were truncated by ellipsis in the shipped UI.
    const texts = labels.map((label) => label.text);
    expect(texts).toContain("Встроенные плагины");
    expect(texts).toContain("Настройки агента");

    // The plugin status row is present and its copy does not overflow.
    const row = page.locator("[data-dsh-i18n-layout-fix-row]");
    await expect(row).toHaveCount(1);
    const rowClip = await row.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(rowClip.scroll).toBeLessThanOrEqual(rowClip.client + 1);

    await expectNoPageOverflow(page);
  });
}

test("200% zoom equivalent keeps the settings panel and its scroll owners usable", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 720, height: 450 },
    deviceScaleFactor: 2,
    locale: "ru-RU",
  });
  const page = await context.newPage();
  await openApp(page, host);
  await openSettings(page);

  const dialog = settingsDialog(page);
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(450 + 0.5);

  const scrollOwners = await page.evaluate(() => {
    const root = document.querySelector('[role="dialog"][data-shortcut-modal="settings"]');
    const options = root?.querySelector<HTMLElement>(":scope > div:last-child");
    const navList = root?.querySelector<HTMLElement>(":scope > nav > div");
    return {
      options: options === undefined || options === null
        ? null
        : { scrollHeight: options.scrollHeight, clientHeight: options.clientHeight },
      nav: navList === undefined || navList === null
        ? null
        : { scrollHeight: navList.scrollHeight, clientHeight: navList.clientHeight },
    };
  });
  expect(scrollOwners.options).not.toBeNull();
  expect(scrollOwners.options!.scrollHeight).toBeGreaterThanOrEqual(
    scrollOwners.options!.clientHeight,
  );

  const labels = await navLabels(page);
  for (const label of labels) {
    expect(label.clipped, label.text).toBe(false);
  }

  await expectNoPageOverflow(page);
  await context.close();
});

test("200% text scale grows nav cells instead of clipping labels", async ({ page }) => {
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await openApp(page, host);
  await openSettings(page);

  const labels = await navLabels(page);
  for (const label of labels) {
    expect(label.clipped, label.text).toBe(false);
    expect(label.cellHeight, label.text).toBeGreaterThanOrEqual(40);
  }
  // The long Russian labels still wrap to a taller cell at 200% text scale.
  expect(Math.max(...labels.map((label) => label.cellHeight))).toBeGreaterThan(40);

  const dialog = settingsDialog(page);
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(900 + 0.5);
  await expectNoPageOverflow(page);
});

test("English interface is unchanged by the Russian-specific rules", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });
  const page = await context.newPage();
  await openApp(page, host);
  await openSettings(page);

  const labels = await navLabels(page);
  for (const label of labels) {
    expect(label.clipped, label.text).toBe(false);
    expect(label.whiteSpace, label.text).toBe("normal");
  }
  await expect(page.locator("[data-dsh-i18n-layout-fix-row]")).toHaveCount(1);
  await expectNoPageOverflow(page);
  await context.close();
});

test("real preset-guide tabs wrap long Russian labels at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openApp(page, host);
  await openSettings(page);

  // Settings → Agent presets → "How to use" opens the shipped guide dialog,
  // whose two `role=tab` items exercise the real tab rule (no fixture).
  await settingsDialog(page)
    .locator(":scope > nav > div > button")
    .filter({ hasText: "Настройки агента" })
    .click();
  const help = page.getByRole("button", { name: /Как использовать:/ }).first();
  await help.waitFor({ state: "visible", timeout: 30_000 });
  await help.click();

  const tablist = page.locator('[role="dialog"]:not([data-shortcut-modal]) [role="tablist"]').first();
  await expect(tablist).toBeVisible();

  const measured = await tablist.evaluate((list) => {
    const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
    return {
      wrap: getComputedStyle(list).flexWrap,
      tabs: tabs.map((tab) => ({
        text: (tab.innerText || "").trim(),
        whiteSpace: getComputedStyle(tab).whiteSpace,
        height: tab.getBoundingClientRect().height,
        clipped: tab.scrollWidth > tab.clientWidth + 1,
      })),
    };
  });

  expect(measured.wrap).toBe("wrap");
  expect(measured.tabs.length).toBe(2);
  for (const tab of measured.tabs) {
    expect(tab.whiteSpace, tab.text).toBe("normal");
    expect(tab.height, tab.text).toBeGreaterThanOrEqual(35);
    expect(tab.clipped, tab.text).toBe(false);
  }
  await expectNoPageOverflow(page);
});

test("synthetic form/tab fixture (unit-level CSS coverage)", async ({ page }) => {
  await openApp(page, host);
  await openSettings(page);

  await page.evaluate(() => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Form and tabs fixture");
    dialog.style.cssText = "position:fixed;left:24px;bottom:24px;width:320px;z-index:2000";
    dialog.innerHTML = `
      <div role="tablist" style="display:flex;gap:4px">
        <button role="tab" aria-selected="true">Длинная вкладка один</button>
        <button role="tab" aria-selected="false">Длинная вкладка два</button>
      </div>
      <form style="display:flex;gap:8px">
        <input aria-label="Поле" style="width:400px" />
        <select aria-label="Выбор"><option>Значение</option></select>
      </form>`;
    document.body.append(dialog);
  });

  const fixture = page.locator('[role="dialog"][aria-label="Form and tabs fixture"]');
  const measured = await fixture.evaluate((root) => {
    const tablist = root.querySelector<HTMLElement>('[role="tablist"]')!;
    const tabs = [...root.querySelectorAll<HTMLElement>('[role="tab"]')];
    const input = root.querySelector<HTMLInputElement>("input")!;
    return {
      tablistWrap: getComputedStyle(tablist).flexWrap,
      tabs: tabs.map((tab) => ({
        whiteSpace: getComputedStyle(tab).whiteSpace,
        height: tab.getBoundingClientRect().height,
        clipped: tab.scrollWidth > tab.clientWidth + 1,
      })),
      inputMax: getComputedStyle(input).maxInlineSize,
      inputWidth: input.getBoundingClientRect().width,
    };
  });

  expect(measured.tablistWrap).toBe("wrap");
  for (const tab of measured.tabs) {
    expect(tab.whiteSpace).toBe("normal");
    expect(tab.height).toBeGreaterThan(28);
    expect(tab.clipped).toBe(false);
  }
  expect(measured.inputMax).toBe("100%");
  expect(measured.inputWidth).toBeLessThanOrEqual(320);
  await fixture.evaluate((element) => element.remove());
});

test("dialogs keep a scrollable content column at a short viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 360 });
  await openApp(page, host);
  await openSettings(page);

  const scroll = await page.evaluate(() => {
    const root = document.querySelector('[role="dialog"][data-shortcut-modal="settings"]');
    const options = root?.querySelector<HTMLElement>(":scope > div:last-child");
    if (options === undefined || options === null) return null;
    return {
      overflowY: getComputedStyle(options).overflowY,
      scrollHeight: options.scrollHeight,
      clientHeight: options.clientHeight,
    };
  });
  expect(scroll).not.toBeNull();
  expect(scroll!.overflowY).toBe("auto");
  expect(scroll!.scrollHeight).toBeGreaterThan(scroll!.clientHeight);
  await expectNoPageOverflow(page);
});
