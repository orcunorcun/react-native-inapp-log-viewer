import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { createLogger } from "../core/logger";

describe("core logger", () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it("keeps only the latest entries when ring buffer reaches max capacity", () => {
    const logger = createLogger({ enabled: true, maxEntries: 3 });

    logger.log({ source: "console", summary: "log-1" });
    logger.log({ source: "console", summary: "log-2" });
    logger.log({ source: "console", summary: "log-3" });
    logger.log({ source: "console", summary: "log-4" });

    const logs = logger.getSnapshot();
    expect(logs).toHaveLength(3);
    expect(logs[0]?.summary).toBe("log-2");
    expect(logs[2]?.summary).toBe("log-4");
  });

  it("redacts sensitive keys and truncates preview text", () => {
    const logger = createLogger({ enabled: true });

    const preview = logger.toPreview({
      Authorization: "Bearer secret-token",
      nested: {
        password: "my-password",
      },
      hugeText: "x".repeat(500),
    });

    expect(preview).toContain('"Authorization":"[REDACTED]"');
    expect(preview).toContain('"password":"[REDACTED]"');
    expect(preview.length).toBeLessThanOrEqual(200);
  });

  it("shows data up to depth 12 and truncates deeper content with [MaxDepth]", () => {
    const logger = createLogger({ enabled: true });

    let deepValue: Record<string, unknown> = {
      leaf: "done",
    };

    for (let level = 13; level >= 1; level -= 1) {
      deepValue = {
        [`level${level}`]: deepValue,
      };
    }

    const details = logger.toDetails(deepValue);
    const serialized = JSON.stringify(details);

    expect(serialized).toContain('"level11"');
    expect(serialized).toContain('"level12":"[MaxDepth]"');
    expect(serialized).not.toContain('"leaf":"done"');
  });

  it("hydrates entries from optional storage adapter", async () => {
    const storage: { value: string | null } = { value: null };
    const storageAdapter = {
      getItem: async () => storage.value,
      setItem: async (_key: string, value: string) => {
        storage.value = value;
      },
    };

    const loggerA = createLogger({
      enabled: true,
      storageAdapter,
      storageKey: "logger-test",
      persistDebounceMs: 0,
    });

    loggerA.log({
      source: "custom",
      level: "info",
      summary: "persist-me",
      details: { token: "abc" },
    });

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });

    const loggerB = createLogger({
      enabled: true,
      storageAdapter,
      storageKey: "logger-test",
    });

    await loggerB.hydrate();

    const logs = loggerB.getSnapshot();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.summary).toBe("persist-me");
    expect((logs[0]?.details as { token: string }).token).toBe("[REDACTED]");
  });

  it("preserves newly added logs when hydration resolves later", async () => {
    const persistedEntries = [
      {
        id: "1",
        timestamp: 1,
        source: "console",
        level: "log",
        summary: "persisted-entry",
      },
    ];
    const storageAdapter = {
      getItem: async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 20);
        });
        return JSON.stringify(persistedEntries);
      },
      setItem: async () => undefined,
    };

    const logger = createLogger({
      enabled: true,
      storageAdapter,
      storageKey: "logger-hydrate-race",
    });

    logger.log({
      source: "custom",
      level: "info",
      summary: "runtime-entry",
    });

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 40);
    });

    const summaries = logger.getSnapshot().map((entry) => entry.summary);
    expect(summaries).toContain("persisted-entry");
    expect(summaries).toContain("runtime-entry");
  });

  it("does not treat plain request-shaped objects as Request instances", () => {
    const logger = createLogger({ enabled: true });

    const details = logger.toDetails({
      stage: "request",
      method: "GET",
      url: "https://example.com/items",
      headers: { authorization: "Bearer secret-token" },
      data: { id: 1 },
    }) as Record<string, unknown>;

    expect(details.stage).toBe("request");
    expect(details.method).toBe("GET");
    expect(details.url).toBe("https://example.com/items");
    expect(details.data).toEqual({ id: 1 });

    const headers = details.headers as Record<string, unknown>;
    expect(headers.authorization).toBe("[REDACTED]");
  });

  it("redacts all matching keys with global regular expressions", () => {
    const logger = createLogger({
      enabled: true,
      redactKeyMatcher: /token/gi,
    });

    const details = logger.toDetails({
      tokenA: "a",
      tokenB: "b",
    }) as Record<string, unknown>;

    expect(details.tokenA).toBe("[REDACTED]");
    expect(details.tokenB).toBe("[REDACTED]");
  });

  it("normalizes complex runtime types into readable structures", () => {
    const logger = createLogger({ enabled: true });

    const headersLike = {
      append: () => undefined,
      get: () => null,
      forEach: (
        callback: (headerValue: unknown, headerKey: string) => void,
      ) => {
        callback("Bearer token-value", "authorization");
        callback("application/json", "content-type");
      },
    };

    const details = logger.toDetails({
      map: new Map<unknown, unknown>([
        ["name", "alice"],
        ["count", 2],
      ]),
      set: new Set<unknown>(["x", "y"]),
      regex: /abc/gi,
      promise: Promise.resolve("ok"),
      headers: headersLike,
    }) as Record<string, unknown>;

    const mapDetails = details.map as Record<string, unknown>;
    const setDetails = details.set as Record<string, unknown>;
    const normalizedHeaders = details.headers as Record<string, unknown>;

    expect(mapDetails.__type).toBe("Map");
    expect(mapDetails.size).toBe(2);
    expect(Array.isArray(mapDetails.entries)).toBe(true);
    expect(setDetails.__type).toBe("Set");
    expect(Array.isArray(setDetails.values)).toBe(true);
    expect(details.regex).toBe("/abc/gi");
    expect(details.promise).toBe("[Promise]");
    expect(normalizedHeaders.authorization).toBe("[REDACTED]");
    expect(normalizedHeaders["content-type"]).toBe("application/json");
  });

  it("returns immutable snapshots with stable references until state changes", () => {
    const logger = createLogger({ enabled: true });
    logger.log({
      source: "custom",
      level: "info",
      summary: "immutable-entry",
      details: {
        nested: {
          token: "secret",
        },
      },
    });

    const snapshotA = logger.getSnapshot();
    const snapshotB = logger.getSnapshot();

    expect(snapshotA).toBe(snapshotB);
    expect(Object.isFrozen(snapshotA)).toBe(true);

    const details = snapshotA[0]?.details as
      | { nested?: { token?: string } }
      | undefined;
    expect(Object.isFrozen(details ?? {})).toBe(true);
    expect(Object.isFrozen(details?.nested ?? {})).toBe(true);

    expect(() => {
      (snapshotA as unknown as unknown[]).push("unexpected");
    }).toThrow();

    logger.log({
      source: "custom",
      level: "info",
      summary: "next-entry",
    });

    const snapshotC = logger.getSnapshot();
    expect(snapshotC).not.toBe(snapshotA);
    expect(snapshotC).toHaveLength(2);
  });
});
