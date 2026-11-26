import { describe, it, expect } from "vitest";
import { expectedLastSession, marketClosedNote, localHour } from "./session";

// 6h00 à Berlin = 05:00 UTC en hiver.
const at = (iso: string) => new Date(iso);

describe("séances US", () => {
  it("mardi matin → séance attendue du lundi", () => {
    expect(expectedLastSession(at("2026-11-24T05:00:00Z"))).toBe("2026-11-23");
  });
  it("lundi matin → séance attendue du vendredi", () => {
    expect(expectedLastSession(at("2026-11-23T05:00:00Z"))).toBe("2026-11-20");
  });
  it("cours à jour → pas de note", () => {
    expect(marketClosedNote("2026-11-23", at("2026-11-24T05:00:00Z"))).toBeNull();
  });
  it("samedi → cours du vendredi", () => {
    expect(marketClosedNote("2026-11-20", at("2026-11-21T05:00:00Z"))).toBe("Marché fermé (week-end) : cours du vendredi 20/11.");
  });
  it("lendemain de Thanksgiving → jour férié", () => {
    // Jeudi 26/11/2026 férié : vendredi matin, dernier cours = mercredi.
    expect(expectedLastSession(at("2026-11-27T05:00:00Z"))).toBe("2026-11-25");
    expect(marketClosedNote("2026-11-25", at("2026-11-27T05:00:00Z"))).toBe("Marché américain fermé (Thanksgiving) : cours du mercredi 25/11.");
  });
  it("cours vraiment en retard → données en retard", () => {
    expect(marketClosedNote("2026-11-20", at("2026-11-25T05:00:00Z"))).toContain("en retard");
  });
  it("heure de Berlin, été comme hiver", () => {
    expect(localHour(at("2026-07-01T04:00:00Z"), "Europe/Berlin")).toBe(6);
    expect(localHour(at("2026-12-01T05:00:00Z"), "Europe/Berlin")).toBe(6);
  });
});

import { isExchangeOpen } from "./exchanges";
describe("places boursières", () => {
  it("XETRA ouvert un mardi à 10h Berlin, fermé à 6h", () => {
    expect(isExchangeOpen("XETRA", new Date("2026-11-24T09:00:00Z"))).toBe(true);
    expect(isExchangeOpen("XETRA", new Date("2026-11-24T05:00:00Z"))).toBe(false);
  });
  it("New York fermé le samedi ; place inconnue → null", () => {
    expect(isExchangeOpen("NASDAQ/NYSE", new Date("2026-11-21T16:00:00Z"))).toBe(false);
    expect(isExchangeOpen("???", new Date())).toBeNull();
  });
});

import { easter, holidayName, marketDay } from "./holidays";
import { exchangeStatus } from "./exchanges";
describe("jours fériés", () => {
  it("Pâques", () => {
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
  });
  it("calendrier NYSE 2026", () => {
    expect(holidayName("US", "2026-11-26")).toBe("Thanksgiving");
    expect(holidayName("US", "2026-01-19")).toBe("Martin Luther King Day");
    expect(holidayName("US", "2026-05-25")).toBe("Memorial Day");
    expect(holidayName("US", "2026-07-03")).toBe("Independence Day"); // 4 juillet = samedi
    expect(holidayName("US", "2026-04-03")).toBe("Vendredi saint");
    expect(marketDay("US", "2026-11-27").earlyClose).toBe(13);
    expect(holidayName("US", "2026-11-25")).toBeNull();
  });
  it("Xetra, Londres, Suisse", () => {
    expect(holidayName("DE", "2026-12-24")).toBe("Veille de Noël");
    expect(holidayName("DE", "2026-04-06")).toBe("Lundi de Pâques");
    expect(holidayName("UK", "2026-12-28")).toBe("Boxing Day"); // 26/12 = samedi → lundi 28
    expect(holidayName("CH", "2026-05-14")).toBe("Ascension");
  });
  it("New York fermé à Thanksgiving, séance écourtée le lendemain", () => {
    expect(exchangeStatus("NASDAQ/NYSE", new Date("2026-11-26T16:00:00Z"))).toEqual({ open: false, reason: "holiday", holiday: "Thanksgiving" });
    expect(exchangeStatus("NASDAQ/NYSE", new Date("2026-11-27T17:00:00Z"))?.open).toBe(true);  // 12h NY
    expect(exchangeStatus("NASDAQ/NYSE", new Date("2026-11-27T18:30:00Z"))?.open).toBe(false); // 13h30 NY
  });
});
