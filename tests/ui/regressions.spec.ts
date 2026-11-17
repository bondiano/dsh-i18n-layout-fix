/**
 * Blast-radius regressions for the update-dialog rule.
 *
 * `D` deliberately includes the release transition body, not just the generic
 * two-button footer shape. This suite proves that:
 *
 * - the real release prompt is the only dialog that carries the release body;
 * - a real shipped two-button confirmation (shortcut reset) shares the footer
 *   shape but keeps its shipped `nowrap` footer and 36px buttons;
 * - the settings panel and a real input-autofocus dialog are untouched.
 */
import { expect, test } from "@playwright/test";

import {
  openApp,
  openShortcutsResetConfirmation,
  openSettings,
  releaseDialog,
  seedShortcutOverride,
  settingsDialog,
  startHost,
  TWO_BUTTON_DIALOG,
  type Host,
} from "./helpers.ts";

let host: Host;

test.beforeAll(async () => {
  host = await startHost();
});

test.afterAll(async () => {
  await host.stop();
});

test("settings dialog is excluded from the update-dialog rule", async ({ page }) => {
  await openApp(page, host);
  await openSettings(page);

  await expect(releaseDialog(page)).toHaveCount(0);
  expect(await page.locator(TWO_BUTTON_DIALOG).count()).toBe(0);
});

test("real shortcut-reset confirmation keeps its shipped nowrap footer", async ({ page }) => {
  // One modified binding makes the reference dialog expose its reset-all
  // action; the confirmation itself is the shipped Modal with two direct
  // buttons and data-modal-autofocus on Cancel.
  await seedShortcutOverride(page);
  await openApp(page, host);
  const reset = await openShortcutsResetConfirmation(page);

  // The generic two-button shape exists in the real application ...
  expect(await page.locator(TWO_BUTTON_DIALOG).count()).toBe(1);
  // ... but it is not the release prompt and receives no plugin styles.
  await expect(releaseDialog(page)).toHaveCount(0);

  const untouched = await reset.evaluate((root) => {
    const footer = root.querySelector<HTMLElement>(":scope > div:last-child")!;
    const buttons = [...footer.querySelectorAll<HTMLElement>(":scope > button")];
    return {
      wrap: getComputedStyle(footer).flexWrap,
      buttons: buttons.map((button) => ({
        text: (button.innerText || "").trim(),
        height: button.getBoundingClientRect().height,
        overflowWrap: getComputedStyle(button).overflowWrap,
        flex: getComputedStyle(button).flex,
        minBlockSize: getComputedStyle(button).minBlockSize,
      })),
    };
  });

  expect(untouched.wrap).toBe("nowrap");
  expect(untouched.buttons).toHaveLength(2);
  for (const button of untouched.buttons) {
    expect(button.height, button.text).toBe(36);
    expect(button.overflowWrap, button.text).toBe("normal");
    expect(button.flex, button.text).toBe("0 1 auto");
    expect(button.minBlockSize, button.text).toBe("auto");
  }
});

test("dialogs without the semantic shape are untouched", async ({ page }) => {
  await openApp(page, host);

  // Workspace rename: input autofocus, no button autofocus -> not matched.
  const row = page.locator('[role="treeitem"]').first();
  await row.hover();
  await page.locator('button[aria-label^="Действия рабочей области"]').click();
  await page.getByRole("menuitem", { name: "Переименовать" }).click();
  const rename = page.locator('[role="dialog"][aria-label="Переименовать рабочую область"]');
  await expect(rename).toBeVisible();
  await expect(releaseDialog(page)).toHaveCount(0);

  const untouched = await rename.evaluate((root) => {
    const footer = root.querySelector<HTMLElement>(":scope > div:last-child");
    const button = footer?.querySelector<HTMLElement>(":scope > button");
    return {
      wrap: footer === undefined || footer === null ? null : getComputedStyle(footer).flexWrap,
      height: button?.getBoundingClientRect().height ?? null,
    };
  });
  expect(untouched.wrap).toBe("nowrap");
  expect(untouched.height).toBe(36);
  await page.keyboard.press("Escape");
  await expect(rename).toHaveCount(0);

  // Real settings form: the dialog form rule removes the artificial inline
  // minimum and caps the control at its column.
  await openSettings(page);
  await settingsDialog(page)
    .locator(":scope > nav > div > button")
    .nth(1)
    .click();
  const input = settingsDialog(page).locator("input").first();
  await input.waitFor({ state: "attached", timeout: 30_000 });
  const form = await input.evaluate((element) => {
    const options = element.closest<HTMLElement>('[class*="options"]');
    const rect = element.getBoundingClientRect();
    return {
      maxInlineSize: getComputedStyle(element).maxInlineSize,
      width: rect.width,
      container: options?.getBoundingClientRect().width ?? null,
      minInlineSize: getComputedStyle(element).minInlineSize,
    };
  });
  expect(form.maxInlineSize).toBe("100%");
  expect(form.minInlineSize).toBe("0px");
  if (form.container !== null) expect(form.width).toBeLessThanOrEqual(form.container + 0.5);
});
