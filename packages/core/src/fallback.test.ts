import { describe, it, expect } from "vitest";
import { withFallback } from "./fallback";

const ok = (name: string, v: number) => ({ name, run: async () => v });
const ko = (name: string) => ({ name, run: async (): Promise<number> => { throw new Error("panne"); } });
const now = () => new Date("2026-11-26T05:00:00Z");

describe("withFallback", () => {
  it("source principale → ok", async () => {
    const r = await withFallback([ok("A", 1), ok("B", 2)], null, now);
    expect(r).toMatchObject({ data: 1, source: "A", status: "ok" });
  });
  it("secours → fallback", async () => {
    const r = await withFallback([ko("A"), ok("B", 2)], null, now);
    expect(r).toMatchObject({ data: 2, source: "B", status: "fallback" });
  });
  it("tout en panne → dernière valeur périmée, date d'origine conservée", async () => {
    const last = { data: 9, source: "A", fetchedAt: "2026-11-25T05:00:00Z", status: "ok" as const };
    const r = await withFallback([ko("A"), ko("B")], last, now);
    expect(r).toMatchObject({ data: 9, status: "stale", fetchedAt: "2026-11-25T05:00:00Z" });
    expect(r.error).toContain("A: panne");
  });
  it("tout en panne sans historique → error, sans exception", async () => {
    const r = await withFallback([ko("A")], null, now);
    expect(r).toMatchObject({ data: null, status: "error" });
  });
});
