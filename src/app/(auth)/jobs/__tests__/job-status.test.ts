import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { changeJobStatus } from "../job-status";

describe("changeJobStatus", () => {
  const setLoading = vi.fn();
  const refresh = vi.fn();
  const alertMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("alert", alertMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("envoie le statut en PATCH puis rafraîchit la page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await changeJobStatus("/api/jobs/j1", "ARCHIVED", { setLoading, refresh });

    expect(fetchMock).toHaveBeenCalledWith("/api/jobs/j1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    expect(refresh).toHaveBeenCalled();
    expect(setLoading.mock.calls).toEqual([[true], [false]]);
  });

  it("signale l'erreur de l'API sans rafraîchir", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "Accès refusé" }) }));

    await changeJobStatus("/api/jobs/j1", "ACTIVE", { setLoading, refresh });

    expect(alertMock).toHaveBeenCalledWith("Accès refusé");
    expect(refresh).not.toHaveBeenCalled();
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it("repasse à « pas en cours » même si la requête échoue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("réseau")));
    await expect(changeJobStatus("/api/jobs/j1", "ACTIVE", { setLoading, refresh })).rejects.toThrow("réseau");
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });
});
