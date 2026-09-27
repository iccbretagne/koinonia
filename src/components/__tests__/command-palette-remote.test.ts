import { describe, expect, it } from "vitest";
import { resetLoadingToIdle, type Remote } from "../command-palette-remote";

describe("resetLoadingToIdle", () => {
  it("remet 'loading' à 'idle' (requête annulée pendant le chargement)", () => {
    const loading: Remote<unknown> = { status: "loading" };
    expect(resetLoadingToIdle(loading)).toEqual({ status: "idle" });
  });

  it("laisse 'idle' et 'unavailable' inchangés", () => {
    const idle: Remote<unknown> = { status: "idle" };
    const unavailable: Remote<unknown> = { status: "unavailable" };
    expect(resetLoadingToIdle(idle)).toBe(idle);
    expect(resetLoadingToIdle(unavailable)).toBe(unavailable);
  });

  it("laisse 'ready' inchangé : un résultat déjà chargé n'est pas jeté", () => {
    const ready: Remote<{ id: string }> = { status: "ready", rows: [{ id: "1" }] };
    expect(resetLoadingToIdle(ready)).toBe(ready);
  });
});
