/**
 * Machine-level regression tests: the plugin must execute the same XState
 * machines that generated its documentation
 * (`extensions/dsh/machines/machines/dsh-i18n-layout-fix.mjs`).
 */
import { describe, expect, it } from "vitest";

import {
  i18nApplyMachine,
  nextApplyState,
} from "../apply.machine.ts";
import {
  i18nInstallMachine,
  nextInstallState,
  type InstallStatus,
} from "../install.machine.ts";

describe("i18nInstall machine", () => {
  it("walks the real lifecycle: installing -> active -> disposed", () => {
    let status: InstallStatus = "installing";

    // One ACQUIRED per resource: stylesheet, en, ru, language, corrections.
    for (let resource = 0; resource < 5; resource += 1) {
      status = nextInstallState(status, "ACQUIRED");
      expect(status).toBe("installing");
    }

    status = nextInstallState(status, "ALL_ACQUIRED");
    expect(status).toBe("active");

    status = nextInstallState(status, "DISPOSE");
    expect(status).toBe("disposed");
    expect(i18nInstallMachine.id).toBe("i18nInstall");
  });

  it("walks the failure lifecycle: rollingBack -> rolledBack -> failed", () => {
    expect(nextInstallState("installing", "ACQUIRE_FAILED")).toBe("rollingBack");
    expect(nextInstallState("rollingBack", "RELEASED")).toBe("rolledBack");
    expect(nextInstallState("rolledBack", "RETHROW")).toBe("failed");
  });

  it("rejects illegal transitions, including from final states", () => {
    expect(() => nextInstallState("active", "ACQUIRE_FAILED")).toThrow(
      "illegal transition: i18nInstall active --ACQUIRE_FAILED-->",
    );
    // A second DISPOSE from the final state must not silently pass.
    expect(() => nextInstallState("disposed", "DISPOSE")).toThrow(
      "illegal transition: i18nInstall disposed --DISPOSE-->",
    );
    expect(() => nextInstallState("failed", "RELEASED")).toThrow(
      "illegal transition: i18nInstall failed --RELEASED-->",
    );
  });
});

describe("i18nApply machine", () => {
  it("walks the real lifecycle: mounting -> active -> disposed", () => {
    expect(nextApplyState("mounting", "MOUNTED")).toBe("active");
    expect(nextApplyState("active", "DISPOSE")).toBe("disposed");
    expect(i18nApplyMachine.id).toBe("i18nApply");
  });

  it("walks the failure lifecycle: mounting -> rollingBack -> failed", () => {
    expect(nextApplyState("mounting", "MOUNT_FAILED")).toBe("rollingBack");
    expect(nextApplyState("rollingBack", "RELEASED")).toBe("failed");
  });

  it("rejects illegal transitions", () => {
    expect(() => nextApplyState("mounting", "DISPOSE")).toThrow(
      "illegal transition: i18nApply mounting --DISPOSE-->",
    );
    expect(() => nextApplyState("disposed", "MOUNTED")).toThrow(
      "illegal transition: i18nApply disposed --MOUNTED-->",
    );
  });
});
