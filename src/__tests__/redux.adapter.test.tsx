import { describe, expect, it } from "@jest/globals";

import { createLogger } from "../core/logger";
import { createReduxActionLogMiddleware } from "../adapters/redux";

describe("redux adapter", () => {
  it("logs action type only by default and keeps full payload in details", () => {
    const logger = createLogger({ enabled: true });
    const middleware = createReduxActionLogMiddleware(logger);

    const invoke = middleware({
      dispatch: () => undefined,
      getState: () => ({}),
    })((action: unknown) => action);

    const largePayload = {
      bigText: "x".repeat(600),
      nested: {
        item: 1,
      },
    };

    invoke({
      type: "test/withPayload",
      payload: largePayload,
    });

    const logs = logger.getSnapshot();
    expect(logs).toHaveLength(1);

    const entry = logs[0];
    expect(entry?.source).toBe("action");
    expect(entry?.summary).toBe("test/withPayload");

    const details = entry?.details as {
      type: string;
      payload: typeof largePayload;
    };

    expect(details.type).toBe("test/withPayload");
    expect(details.payload.bigText.length).toBeGreaterThan(100);
  });

  it("can include payload preview in summary when explicitly enabled", () => {
    const logger = createLogger({ enabled: true });
    const middleware = createReduxActionLogMiddleware(logger, {
      includePayloadInSummary: true,
    });

    const invoke = middleware({
      dispatch: () => undefined,
      getState: () => ({}),
    })((action: unknown) => action);

    invoke({
      type: "test/withPayloadPreview",
      payload: {
        item: 1,
      },
    });

    const entry = logger.getSnapshot()[0];
    expect(entry?.summary).toContain("test/withPayloadPreview");
    expect(entry?.summary).toContain("payload=");
  });

  it("respects runtime logger enablement when option is not explicitly set", () => {
    const logger = createLogger({ enabled: false });
    const middleware = createReduxActionLogMiddleware(logger);

    const invoke = middleware({
      dispatch: () => undefined,
      getState: () => ({}),
    })((action: unknown) => action);

    invoke({ type: "test/disabled" });
    expect(logger.getSnapshot()).toHaveLength(0);

    logger.setEnabled(true);
    invoke({ type: "test/enabled" });

    expect(logger.getSnapshot()).toHaveLength(1);
    expect(logger.getSnapshot()[0]?.summary).toBe("test/enabled");
  });
});
