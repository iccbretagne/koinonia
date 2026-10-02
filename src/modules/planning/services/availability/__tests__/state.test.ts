import { describe, it, expect } from "vitest";
import {
  resolveAvailability,
  countsAsUnavailable,
  unavailabilityReason,
  collectionWindow,
  askDueAt,
  shouldRelance,
  monthStart,
} from "../state";

const now = new Date("2026-10-10T10:00:00Z");
const day = 24 * 3600 * 1000;

describe("resolveAvailability — précédence (ADR-0020)", () => {
  it("une réponse explicite l'emporte sur une période", () => {
    expect(resolveAvailability({ answer: "AVAILABLE", coveredByPeriod: true, asked: true, now })).toEqual({
      state: "AVAILABLE",
      overdue: false,
      source: "response",
    });
  });

  it("une période l'emporte sur « Sans réponse »", () => {
    expect(resolveAvailability({ coveredByPeriod: true, asked: true, now })).toMatchObject({
      state: "UNAVAILABLE",
      source: "period",
    });
  });

  it("sans réponse : en retard une fois l'échéance passée", () => {
    const late = resolveAvailability({ coveredByPeriod: false, asked: true, dueAt: new Date(now.getTime() - day), now });
    expect(late).toMatchObject({ state: "NO_RESPONSE", overdue: true });
    const early = resolveAvailability({ coveredByPeriod: false, asked: true, dueAt: new Date(now.getTime() + day), now });
    expect(early.overdue).toBe(false);
  });

  it("non demandée sinon", () => {
    expect(resolveAvailability({ coveredByPeriod: false, asked: false, now }).state).toBe("NOT_ASKED");
  });
});

describe("countsAsUnavailable / unavailabilityReason", () => {
  it("indisponible déclaré et sans réponse en retard comptent, pas le reste", () => {
    const pas = resolveAvailability({ answer: "UNAVAILABLE", coveredByPeriod: false, asked: true, now });
    const retard = resolveAvailability({ coveredByPeriod: false, asked: true, dueAt: new Date(now.getTime() - day), now });
    const attente = resolveAvailability({ coveredByPeriod: false, asked: true, dueAt: new Date(now.getTime() + day), now });
    const siBesoin = resolveAvailability({ answer: "IF_NEEDED", coveredByPeriod: false, asked: true, now });
    expect(countsAsUnavailable(pas)).toBe(true);
    expect(countsAsUnavailable(retard)).toBe(true);
    expect(countsAsUnavailable(attente)).toBe(false);
    expect(countsAsUnavailable(siBesoin)).toBe(false);
    expect(unavailabilityReason(attente)).toBeNull();
    expect(unavailabilityReason(retard)).toMatch(/pas répondu/);
  });
});

describe("collectionWindow", () => {
  it("ouvre M-2, ferme J-7 avant le premier événement, relance J-3 avant la clôture", () => {
    const month = new Date("2026-12-01T00:00:00Z");
    const w = collectionWindow({ openMonthsBefore: 2, closeDaysBefore: 7, relanceDaysBefore: 3 }, month, new Date("2026-12-06T09:00:00Z"));
    expect(w.opensAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(w.closesAt.toISOString()).toBe("2026-11-29T09:00:00.000Z");
    expect(w.relanceAt.toISOString()).toBe("2026-11-26T09:00:00.000Z");
  });
});

describe("askDueAt", () => {
  const eventDate = new Date(now.getTime() + 20 * day);
  it("reprend la clôture de la collecte si elle n'est pas passée", () => {
    const closes = new Date(now.getTime() + 5 * day);
    expect(askDueAt({ eventDate, collectionClosesAt: closes, now })).toEqual(closes);
  });
  it("sinon J-7 de l'événement", () => {
    expect(askDueAt({ eventDate, collectionClosesAt: new Date(now.getTime() - day), now }).getTime()).toBe(
      eventDate.getTime() - 7 * day
    );
  });
  it("jamais avant maintenant", () => {
    expect(askDueAt({ eventDate: new Date(now.getTime() + 2 * day), now })).toEqual(now);
  });
});

describe("shouldRelance", () => {
  const dueAt = new Date(now.getTime() + 2 * day);
  it("part dans la fenêtre de relance", () => {
    expect(shouldRelance({ dueAt, relanceDaysBefore: 3, openedAt: new Date(now.getTime() - 10 * day), now })).toBe(true);
  });
  it("pas avant la date de relance", () => {
    expect(shouldRelance({ dueAt, relanceDaysBefore: 1, openedAt: new Date(now.getTime() - 10 * day), now })).toBe(false);
  });
  it("pas après l'échéance", () => {
    expect(shouldRelance({ dueAt: new Date(now.getTime() - day), relanceDaysBefore: 3, openedAt: new Date(now.getTime() - 10 * day), now })).toBe(false);
  });
  it("pas si ouverte après la date de relance (l'ouverture tient lieu de relance)", () => {
    expect(shouldRelance({ dueAt, relanceDaysBefore: 3, openedAt: new Date(now.getTime() - day), now })).toBe(false);
  });
});

describe("monthStart", () => {
  it("premier jour du mois en UTC", () => {
    expect(monthStart(new Date("2026-12-31T23:30:00Z")).toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});
