import { describe, expect, it } from "@jest/globals";

import { interceptConsole } from "../adapters/console";
import { createLogger } from "../core/logger";

describe("console adapter", () => {
  it("captures console logs and normalizes details", () => {
    const logger = createLogger({ enabled: true });

    const detach = interceptConsole(logger, { enabled: true });
    console.log("[UnitTestConsole]", "result:", {
      token: "super-secret",
      value: 1,
    });
    detach();

    const entry = logger
      .getSnapshot()
      .reverse()
      .find(
        (item) =>
          item.source === "console" &&
          item.summary.includes("[UnitTestConsole]"),
      );

    expect(entry).toBeDefined();
    const details = entry?.details as {
      result?: {
        token: string;
      };
    };

    expect(details.result?.token).toBe("[REDACTED]");
  });

  it("captures logs for each active interceptor instance", () => {
    const loggerA = createLogger({ enabled: true });
    const loggerB = createLogger({ enabled: true });
    const marker = "[UnitTestConsole][multi-interceptor]";

    const detachA = interceptConsole(loggerA, { enabled: true });
    const detachB = interceptConsole(loggerB, { enabled: true });
    console.info(marker);
    detachA();
    detachB();

    const hasInLoggerA = loggerA
      .getSnapshot()
      .some(
        (entry) => entry.source === "console" && entry.summary.includes(marker),
      );
    const hasInLoggerB = loggerB
      .getSnapshot()
      .some(
        (entry) => entry.source === "console" && entry.summary.includes(marker),
      );

    expect(hasInLoggerA).toBe(true);
    expect(hasInLoggerB).toBe(true);
  });

  it("respects runtime logger enablement when option is not explicitly set", () => {
    const logger = createLogger({ enabled: false });
    const disabledMarker = "[UnitTestConsole][disabled]";
    const enabledMarker = "[UnitTestConsole][enabled]";

    const detach = interceptConsole(logger);
    console.debug(disabledMarker);

    logger.setEnabled(true);
    console.debug(enabledMarker);
    detach();

    const summaries = logger
      .getSnapshot()
      .filter((entry) => entry.source === "console")
      .map((entry) => entry.summary);

    expect(summaries.some((summary) => summary.includes(disabledMarker))).toBe(
      false,
    );
    expect(summaries.some((summary) => summary.includes(enabledMarker))).toBe(
      true,
    );
  });
});
