import { describe, expect, it } from "vitest";
import { computeDiff } from "@/lib/db/helpers";

describe("computeDiff", () => {
  it("detects changed fields", () => {
    const before = {
      title: "A",
      status: "open",
      deadlineAt: null,
    };

    const after = {
      title: "A",
      status: "klaar",
      deadlineAt: "2026-02-26T10:00:00.000Z",
    };

    const diff = computeDiff(before, after);

    expect(Object.keys(diff)).toEqual(["status", "deadlineAt"]);
    expect(diff.status.before).toBe("open");
    expect(diff.status.after).toBe("klaar");
  });
});
