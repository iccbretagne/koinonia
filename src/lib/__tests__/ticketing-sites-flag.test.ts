/** Tests — drapeau d'instance des sites d'événement (spec 084) : coupé par défaut, actif en recette. */
import { describe, it, expect, afterEach } from "vitest";
import { ticketingSitesEnabled } from "../ticketing-sites-flag";

const KEYS = ["NEXT_PUBLIC_TICKETING_SITES_ENABLED", "TICKETING_SITES_ENABLED"] as const;
afterEach(() => KEYS.forEach((k) => delete process.env[k]));

describe("ticketingSitesEnabled", () => {
  it("coupé par défaut (production)", () => {
    KEYS.forEach((k) => delete process.env[k]);
    expect(ticketingSitesEnabled()).toBe(false);
  });
  it("actif par le build de recette ou par le .env du serveur ; toute autre valeur = coupé", () => {
    process.env.NEXT_PUBLIC_TICKETING_SITES_ENABLED = "true";
    expect(ticketingSitesEnabled()).toBe(true);
    delete process.env.NEXT_PUBLIC_TICKETING_SITES_ENABLED;
    process.env.TICKETING_SITES_ENABLED = "true";
    expect(ticketingSitesEnabled()).toBe(true);
    process.env.TICKETING_SITES_ENABLED = "1";
    expect(ticketingSitesEnabled()).toBe(false);
  });
});
