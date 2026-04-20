import { describe, expect, it } from "@jest/globals";

import { attachGlobalErrorLogger } from "../adapters/globalError";
import { createLogger } from "../core/logger";

describe("global error adapter", () => {
  it("captures uncaught global errors through ErrorUtils", () => {
    const originalErrorUtils = (
      globalThis as typeof globalThis & { ErrorUtils?: unknown }
    ).ErrorUtils;
    const logger = createLogger({ enabled: true });

    const previousHandler = () => {
      // no-op by design
    };

    let activeHandler: (error: unknown, isFatal?: boolean) => void =
      previousHandler;

    try {
      (globalThis as typeof globalThis & { ErrorUtils?: unknown }).ErrorUtils =
        {
          getGlobalHandler: () => previousHandler,
          setGlobalHandler: (
            handler: (error: unknown, isFatal?: boolean) => void,
          ) => {
            activeHandler = handler;
          },
        };

      const detach = attachGlobalErrorLogger(logger, { enabled: true });
      activeHandler(new Error("boom"), true);
      detach();

      const logs = logger.getSnapshot();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.source).toBe("error");
      expect(logs[0]?.summary).toContain("boom");
    } finally {
      (globalThis as typeof globalThis & { ErrorUtils?: unknown }).ErrorUtils =
        originalErrorUtils;
    }
  });

  it("keeps later attachments active when earlier one detaches", () => {
    const originalErrorUtils = (
      globalThis as typeof globalThis & { ErrorUtils?: unknown }
    ).ErrorUtils;
    const loggerA = createLogger({ enabled: true });
    const loggerB = createLogger({ enabled: true });

    const previousHandler = () => {
      // no-op by design
    };
    let activeHandler: (error: unknown, isFatal?: boolean) => void =
      previousHandler;

    try {
      (globalThis as typeof globalThis & { ErrorUtils?: unknown }).ErrorUtils =
        {
          getGlobalHandler: () => activeHandler,
          setGlobalHandler: (
            handler: (error: unknown, isFatal?: boolean) => void,
          ) => {
            activeHandler = handler;
          },
        };

      const detachA = attachGlobalErrorLogger(loggerA, { enabled: true });
      const detachB = attachGlobalErrorLogger(loggerB, { enabled: true });

      detachA();
      activeHandler(new Error("still-captured"), false);
      detachB();

      const hasInLoggerA = loggerA
        .getSnapshot()
        .some((entry) => entry.summary.includes("still-captured"));
      const hasInLoggerB = loggerB
        .getSnapshot()
        .some((entry) => entry.summary.includes("still-captured"));

      expect(hasInLoggerA).toBe(false);
      expect(hasInLoggerB).toBe(true);
    } finally {
      (globalThis as typeof globalThis & { ErrorUtils?: unknown }).ErrorUtils =
        originalErrorUtils;
    }
  });

  it("respects runtime logger enablement when option is not explicitly set", () => {
    const originalErrorUtils = (
      globalThis as typeof globalThis & { ErrorUtils?: unknown }
    ).ErrorUtils;
    const logger = createLogger({ enabled: false });

    const previousHandler = () => {
      // no-op by design
    };
    let activeHandler: (error: unknown, isFatal?: boolean) => void =
      previousHandler;

    try {
      (globalThis as typeof globalThis & { ErrorUtils?: unknown }).ErrorUtils =
        {
          getGlobalHandler: () => activeHandler,
          setGlobalHandler: (
            handler: (error: unknown, isFatal?: boolean) => void,
          ) => {
            activeHandler = handler;
          },
        };

      const detach = attachGlobalErrorLogger(logger);
      activeHandler(new Error("disabled-error"), false);

      logger.setEnabled(true);
      activeHandler(new Error("enabled-error"), false);
      detach();

      const summaries = logger.getSnapshot().map((entry) => entry.summary);
      expect(
        summaries.some((summary) => summary.includes("disabled-error")),
      ).toBe(false);
      expect(
        summaries.some((summary) => summary.includes("enabled-error")),
      ).toBe(true);
    } finally {
      (globalThis as typeof globalThis & { ErrorUtils?: unknown }).ErrorUtils =
        originalErrorUtils;
    }
  });
});
