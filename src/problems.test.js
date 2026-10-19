import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brokenSpecs, countByCause } from "./problems.js";

const spec = (key, room, code) => ({ key, room, problem: code ? { code, label: code.toUpperCase() } : undefined });

describe("MR cassées", () => {
  it("ne garde que ce qui est à l'atelier avec une cause connue", () => {
    const specs = [spec("a", "fix", "conflict"), spec("b", "fix"), spec("c", "rev", "conflict"), spec("d", "fix", "pipeline")];
    assert.deepEqual(brokenSpecs(specs).map((entry) => entry.key), ["a", "d"]);
  });

  it("compte par cause dans l'ordre d'apparition", () => {
    const specs = [spec("a", "fix", "pipeline"), spec("b", "fix", "conflict"), spec("c", "fix", "pipeline")];
    assert.deepEqual(countByCause(specs), [
      { code: "pipeline", label: "PIPELINE", count: 2 },
      { code: "conflict", label: "CONFLICT", count: 1 },
    ]);
  });
});
