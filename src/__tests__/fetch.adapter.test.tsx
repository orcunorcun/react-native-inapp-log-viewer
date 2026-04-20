import { describe, expect, it } from "@jest/globals";

import { createFetchLogger } from "../adapters/fetch";
import { createLogger } from "../core/logger";

describe("fetch adapter", () => {
  it("logs request and response lifecycle", async () => {
    const logger = createLogger({ enabled: true });

    const mockFetch = async () => {
      return {
        status: 200,
        headers: {
          forEach: (callback: (value: string, key: string) => void) => {
            callback("application/json", "content-type");
          },
        },
      } as Response;
    };

    const wrappedFetch = createFetchLogger(logger, {
      enabled: true,
      fetchImpl: mockFetch as typeof fetch,
    });

    await wrappedFetch("https://example.com/items", {
      method: "POST",
      body: JSON.stringify({ id: 1 }),
    });

    const logs = logger.getSnapshot().filter((log) => log.source === "api");

    expect(logs).toHaveLength(2);
    expect(logs[0]?.summary).toContain("[REQ] POST https://example.com/items");
    expect(logs[1]?.summary).toContain(
      "[RES] POST https://example.com/items -> 200",
    );
  });

  it("respects runtime logger enablement when option is not explicitly set", async () => {
    const logger = createLogger({ enabled: false });

    const mockFetch = async () => {
      return {
        status: 200,
        headers: {
          forEach: (_callback: (value: string, key: string) => void) => {
            // no-op by design
          },
        },
      } as Response;
    };

    const wrappedFetch = createFetchLogger(logger, {
      fetchImpl: mockFetch as typeof fetch,
    });

    await wrappedFetch("https://example.com/toggle");
    expect(logger.getSnapshot()).toHaveLength(0);

    logger.setEnabled(true);
    await wrappedFetch("https://example.com/toggle");

    expect(
      logger.getSnapshot().filter((entry) => entry.source === "api"),
    ).toHaveLength(2);
  });
});
