import { describe, expect, it } from "vitest";
import { frame } from "../test/fixture";
import { parseSnapshot } from "./model";
describe("tag contract", () => {
  it("accepts a complete simulated snapshot", () =>
    expect(parseSnapshot(JSON.stringify(frame())).tags).toHaveLength(3));
  it("rejects malformed values, duplicate tags and unsupported sources", () => {
    for (const change of [
      { value: "42" },
      { value: 101 },
      { source: "REAL" },
      { writable: true },
      { quality: "UNKNOWN" },
      { serverTimestamp: "invalid" },
    ]) {
      const data = frame();
      Object.assign(data.tags[0], change);
      expect(() => parseSnapshot(JSON.stringify(data))).toThrow();
    }
    const data = frame();
    data.tags[1] = data.tags[0];
    expect(() => parseSnapshot(JSON.stringify(data))).toThrow();
  });
});
