import { describe, expect, it } from "@jest/globals";

import {
  buildCollapsedSummary,
  buildRuntimeLogMeta,
  getExpandedDetailsValue,
  parseApiSummary,
} from "../components/InAppLogViewer";
import type { LogEntry } from "../types";

const createLogEntry = (overrides: Partial<LogEntry>): LogEntry => {
  return {
    id: "1",
    timestamp: 1_735_689_600_000,
    source: "custom",
    level: "info",
    summary: "default-summary",
    ...overrides,
  };
};

describe("InAppLogViewer helpers", () => {
  it("parses API lifecycle summary text", () => {
    const responseSummary = parseApiSummary(
      "[RES] POST /v1/users -> 201 (123ms)",
    );
    const requestSummary = parseApiSummary("[REQ] GET /v1/users");
    const errorSummary = parseApiSummary(
      "[ERR] GET /v1/users -> timeout (999ms)",
    );

    expect(responseSummary).toEqual({
      stage: "response",
      method: "POST",
      url: "/v1/users",
      status: "201",
      durationMs: "123",
    });
    expect(requestSummary.stage).toBe("request");
    expect(requestSummary.method).toBe("GET");
    expect(errorSummary.stage).toBe("error");
    expect(errorSummary.method).toBe("GET");
    expect(errorSummary.url).toBe("/v1/users");
    expect(errorSummary.durationMs).toBe("999");
  });

  it("builds API badges and hidden keys for response entries", () => {
    const logEntry = createLogEntry({
      source: "api",
      summary: "[RES] GET /v1/orders -> 200 (52ms)",
      details: {
        stage: "response",
        method: "GET",
        url: "/v1/orders",
        status: 200,
        durationMs: 52,
      },
    });

    const meta = buildRuntimeLogMeta(logEntry);

    expect(meta.badges.map((badge) => badge.label)).toEqual([
      "↓ RESPONSE",
      "200",
      "52ms",
      "GET",
    ]);
    expect(meta.hiddenDetailKeys).toEqual(
      expect.arrayContaining([
        "stage",
        "status",
        "durationMs",
        "method",
        "url",
      ]),
    );
  });

  it("collapses API response summary to url and hides meta-only details", () => {
    const logEntry = createLogEntry({
      source: "api",
      summary: "[RES] PATCH /v1/profile -> 204 (18ms)",
      details: {
        stage: "response",
        method: "PATCH",
        url: "/v1/profile",
        status: 204,
        durationMs: 18,
        response: { ok: true },
      },
    });

    const collapsedSummary = buildCollapsedSummary(logEntry);
    const meta = buildRuntimeLogMeta(logEntry);
    const expandedDetails = getExpandedDetailsValue(
      logEntry.details,
      meta.hiddenDetailKeys,
    ) as Record<string, unknown>;

    expect(collapsedSummary).toBe("/v1/profile");
    expect(expandedDetails).toEqual({ response: { ok: true } });
  });

  it("returns undefined when all detail keys are hidden", () => {
    const expandedDetails = getExpandedDetailsValue(
      {
        stage: "response",
        method: "GET",
      },
      ["stage", "method"],
    );

    expect(expandedDetails).toBeUndefined();
  });
});
