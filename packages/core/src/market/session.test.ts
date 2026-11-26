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
    expect(marketClosedNote("2026-11-25", at("2026-11-27T05:00:00Z"))).toContain("jour férié");
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
