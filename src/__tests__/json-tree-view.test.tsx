import { describe, expect, it } from "@jest/globals";

import { buildJsonTreeDebugLines } from "../components/JsonTreeView";

describe("JsonTreeView", () => {
  it("returns key/value lines for nested object and array values", () => {
    const debugLines = buildJsonTreeDebugLines({
      name: "alice",
      count: 42,
      active: true,
      tags: ["alpha", "beta"],
      meta: { score: 7 },
      items: [{ sku: "A1" }],
    });

    const combinedLines = debugLines.join("\n");

    expect(combinedLines).toContain("name: alice");
    expect(combinedLines).toContain("count: 42");
    expect(combinedLines).toContain("active: true");
    expect(combinedLines).toContain('tags: ["alpha", "beta"]');
    expect(combinedLines).toContain("meta:");
    expect(combinedLines).toContain("score: 7");
    expect(combinedLines).toContain("items[0]:");
    expect(combinedLines).toContain("sku: A1");
  });
});
