import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseRss } from "./rss";
import { parseFinnhub } from "./finnhub";
import { newsHash } from "./collect";

const fx = (f: string) => readFileSync(new URL(`../__fixtures__/${f}`, import.meta.url), "utf8");

describe("RSS", () => {
  it("lit titre, lien (CDATA) et date ; ignore les liens non http", () => {
    const items = parseRss(fx("fed.xml"), "Réserve fédérale");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "Federal Reserve issues FOMC statement", url: "https://www.federalreserve.gov/a.htm", source: "Réserve fédérale" });
    expect(items[1].title).toBe("Minutes & projections");
    expect(items[0].publishedAt).toBe("2026-11-25T19:00:00.000Z");
  });
  it("rejette une page qui n'est pas un flux", () => {
    expect(() => parseRss("<html></html>", "X")).toThrow();
  });
});

describe("Finnhub", () => {
  it("associe le symbole et ignore les titres vides", () => {
    const items = parseFinnhub(fx("finnhub-company.json"), ["NVDA"]);
    expect(items).toHaveLength(1);
    expect(items[0].symbols).toEqual(["NVDA"]);
  });
  it("erreur de clé → exception (source de secours)", () => {
    expect(() => parseFinnhub('{"error":"Invalid API key"}')).toThrow("Invalid API key");
  });
});

describe("newsHash", () => {
  const a = { title: "a", url: "u1", source: "s", publishedAt: "", symbols: [] };
  const b = { ...a, url: "u2" };
  it("ne dépend pas de l'ordre, change si une actualité arrive", () => {
    expect(newsHash([a, b])).toBe(newsHash([b, a]));
    expect(newsHash([a])).not.toBe(newsHash([a, b]));
  });
});

import { finnhubCovers } from "./collect";
describe("couverture Finnhub gratuite", () => {
  it("actions américaines oui, cotations européennes non", () => {
    expect(["NVDA", "GOOGL", "BRK-B"].every(finnhubCovers)).toBe(true);
    expect(["EUNL.DE", "HNSC.MI", "8PSG.DE", "^VIX"].some(finnhubCovers)).toBe(false);
  });
});
