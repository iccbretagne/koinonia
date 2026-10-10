import { describe, it, expect } from "vitest";
import type { Publication } from "@/modules/jobs";
import {
  expiryLabel,
  isNewSince,
  matchesQuery,
  matchesState,
  matchesTypes,
  rateLabel,
  resolveInitialView,
} from "../board";

const pub = (over: Partial<Publication> = {}): Publication => ({
  kind: "OFFER", id: "p1", title: "Développeur", status: "PUBLISHED", state: "active", href: "/jobs/p1",
  createdAt: "2026-10-05T00:00:00.000Z", author: { id: "a", name: "A" }, isOwn: false, isNew: false,
  organization: "Société Générale", contractTypes: ["EMPLOI"], location: "Saint-Brieuc", remote: false,
  modality: null, duration: null, deadline: null, availableFrom: null, dailyRate: null, hourlyRate: null,
  description: "Poste en équipe", contactEmail: null, contactUrl: null, renewalRequestedAt: null,
  ...over,
});

describe("resolveInitialView", () => {
  it("garde les anciens onglets valides", () => {
    expect(resolveInitialView(undefined)).toEqual({ tab: "opportunites", chips: [] });
    expect(resolveInitialView("offers")).toEqual({ tab: "opportunites", chips: [] });
    expect(resolveInitialView("seekers")).toEqual({ tab: "profils", chips: [] });
    expect(resolveInitialView("profils")).toEqual({ tab: "profils", chips: [] });
    expect(resolveInitialView("freelance")).toEqual({ tab: "opportunites", chips: ["MISSION"] });
  });
});

describe("matchesTypes", () => {
  it("aucune pastille = tout ; un profil visant plusieurs contrats répond à chacun", () => {
    const seeker = pub({ kind: "SEEKER", contractTypes: ["STAGE", "ALTERNANCE"] });
    expect(matchesTypes(seeker, [])).toBe(true);
    expect(matchesTypes(seeker, ["ALTERNANCE"])).toBe(true);
    expect(matchesTypes(seeker, ["EMPLOI"])).toBe(false);
    expect(matchesTypes(pub({ kind: "MISSION", contractTypes: [] }), ["MISSION"])).toBe(true);
    expect(matchesTypes(pub({ kind: "FREELANCE", contractTypes: [] }), ["EMPLOI", "FREELANCE"])).toBe(true);
  });
});

describe("matchesQuery", () => {
  it("ignore accents et casse, sur titre, entreprise, lieu et description", () => {
    expect(matchesQuery(pub(), "developpeur")).toBe(true);
    expect(matchesQuery(pub(), "GÉNÉRALE")).toBe(true);
    expect(matchesQuery(pub(), "saint-brieuc")).toBe(true);
    expect(matchesQuery(pub(), "equipe")).toBe(true);
    expect(matchesQuery(pub(), "  ")).toBe(true);
    expect(matchesQuery(pub(), "comptable")).toBe(false);
  });
});

describe("matchesState", () => {
  const retired = pub({ state: "retired" });
  const ownFilled = pub({ state: "filled", isOwn: true });

  it("un non-modérateur ne voit que l'actif, sauf dans « Mes publications »", () => {
    expect(matchesState(pub(), "active", { canManage: false, mine: false })).toBe(true);
    expect(matchesState(ownFilled, "active", { canManage: false, mine: false })).toBe(false);
    expect(matchesState(ownFilled, "active", { canManage: false, mine: true })).toBe(true);
    expect(matchesState(pub(), "active", { canManage: false, mine: true })).toBe(false);
  });

  it("un modérateur choisit l'état", () => {
    expect(matchesState(retired, "active", { canManage: true, mine: false })).toBe(false);
    expect(matchesState(retired, "inactive", { canManage: true, mine: false })).toBe(true);
    expect(matchesState(pub(), "inactive", { canManage: true, mine: false })).toBe(false);
    expect(matchesState(retired, "all", { canManage: true, mine: false })).toBe(true);
  });
});

describe("expiryLabel", () => {
  const now = new Date("2026-10-10T10:00:00.000Z");
  it("échéance relative, signalée sous 7 jours", () => {
    expect(expiryLabel(null, now)).toBeNull();
    expect(expiryLabel("2026-10-10T21:00:00.000Z", now)).toEqual({ label: "Expire aujourd'hui", soon: true });
    expect(expiryLabel("2026-10-11T12:00:00.000Z", now)).toEqual({ label: "Expire demain", soon: true });
    expect(expiryLabel("2026-10-16T12:00:00.000Z", now)).toEqual({ label: "Expire dans 6 j", soon: true });
    expect(expiryLabel("2026-10-17T12:00:00.000Z", now)).toEqual({ label: "Expire dans 7 j", soon: false });
    expect(expiryLabel("2026-10-08T12:00:00.000Z", now)).toEqual({ label: "Expirée", soon: true });
  });
});

describe("rateLabel", () => {
  it("tarif journalier et horaire", () => {
    expect(rateLabel(null, null)).toBeNull();
    expect(rateLabel("400 €", null)).toBe("400 €/j");
    expect(rateLabel("400 €", "50 €")).toBe("400 €/j · 50 €/h");
  });
});

describe("isNewSince", () => {
  it("opportunité active d'autrui parue après la dernière visite", () => {
    const seen = "2026-10-01T00:00:00.000Z";
    expect(isNewSince(pub(), seen)).toBe(true);
    expect(isNewSince(pub({ isOwn: true }), seen)).toBe(false);
    expect(isNewSince(pub({ state: "expired" }), seen)).toBe(false);
    expect(isNewSince(pub({ kind: "SEEKER" }), seen)).toBe(false);
    expect(isNewSince(pub(), "2026-10-06T00:00:00.000Z")).toBe(false);
  });
});
