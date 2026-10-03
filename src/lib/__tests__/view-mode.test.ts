import { describe, it, expect } from "vitest";
import { isPastoralView } from "../view-mode";

describe("isPastoralView", () => {
  it("jamais pastoral sans profil pastoral dans l'église", () => {
    expect(isPastoralView({ isPastoral: false, hasClassicRole: true, viewModeCookie: "pastoral" })).toBe(false);
  });

  it("double rôle : le cookie départage, pastoral par défaut", () => {
    expect(isPastoralView({ isPastoral: true, hasClassicRole: true, viewModeCookie: undefined })).toBe(true);
    expect(isPastoralView({ isPastoral: true, hasClassicRole: true, viewModeCookie: "pastoral" })).toBe(true);
    expect(isPastoralView({ isPastoral: true, hasClassicRole: true, viewModeCookie: "admin" })).toBe(false);
  });

  it("berger seul : un cookie admin posé dans une autre église est ignoré", () => {
    expect(isPastoralView({ isPastoral: true, hasClassicRole: false, viewModeCookie: "admin" })).toBe(true);
  });
});
