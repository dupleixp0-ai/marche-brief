import { describe, expect, it } from "vitest";
import { marketOutlook, seriesStats } from "./outlook";

const up = Array.from({ length: 260 }, (_, i) => 100 * 1.002 ** i);
const down = Array.from({ length: 260 }, (_, i) => 100 * 0.998 ** i);
const calm = [...Array(250).fill(20), 15];
const nervous = [...Array(250).fill(18), 30];

describe("lecture du marché", () => {
  it("tendance haussière + VIX calme → haussier", () => {
    const o = marketOutlook({ spxCloses: up, vixCloses: calm, fearGreed: 55 });
    expect(o.bias).toBe("haussier");
    expect(o.mediumTerm).toBe("haussier");
    expect(o.signals.find((s) => s.label === "S&P 500 vs MM200")!.effect).toBe(1);
  });
  it("tendance baissière + VIX nerveux → baissier", () => {
    const o = marketOutlook({ spxCloses: down, vixCloses: nervous, fearGreed: 50 });
    expect(o.bias).toBe("baissier");
    expect(o.shortTerm).toBe("baissier");
  });
  it("peur extrême compte à contre-courant (vers la hausse)", () => {
    const o = marketOutlook({ spxCloses: down, vixCloses: nervous, fearGreed: 10 });
    expect(o.signals.find((s) => s.label === "Fear & Greed")!.effect).toBe(1);
    expect(o.points).toBeGreaterThan(marketOutlook({ spxCloses: down, vixCloses: nervous, fearGreed: 50 }).points);
  });
  it("données vides → neutre", () => {
    expect(marketOutlook({ spxCloses: [], vixCloses: [], fearGreed: null }).bias).toBe("neutre");
  });
  it("statistiques d'une série", () => {
    const st = seriesStats(up);
    expect(st.percentile1y).toBe(1);
    expect(st.high1y).toBe(up.at(-1));
    expect(st.change1m).toBeCloseTo(1.002 ** 21 - 1, 6);
  });
});
