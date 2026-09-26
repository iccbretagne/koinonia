import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireAuth = vi.fn();
const mockGetPreferencesView = vi.fn();
const mockGetVisibleDomainKeys = vi.fn();
const mockUpdatePreferences = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
vi.mock("@/lib/notification-preferences", () => ({
  getPreferencesView: (...args: unknown[]) => mockGetPreferencesView(...args),
  getVisibleDomainKeys: (...args: unknown[]) => mockGetVisibleDomainKeys(...args),
  updatePreferences: (...args: unknown[]) => mockUpdatePreferences(...args),
}));

const { GET, PUT } = await import("../preferences/route");

const VIEW = { emailEnabled: true, hasEmail: true, domains: [{ key: "accounting", label: "Comptabilité", description: "d", enabled: true }] };

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/notifications/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/notifications/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
    mockGetPreferencesView.mockResolvedValue(VIEW);
  });

  it("retourne la vue de l'utilisateur courant", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(VIEW);
    expect(mockGetPreferencesView).toHaveBeenCalledWith("user-1");
  });

  it("401 sans session", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/notifications/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createAdminSession());
    mockGetVisibleDomainKeys.mockResolvedValue(new Set(["accounting", "care"]));
    mockUpdatePreferences.mockResolvedValue(undefined);
    mockGetPreferencesView.mockResolvedValue(VIEW);
  });

  it("met à jour puis retourne l'état à jour", async () => {
    const res = await PUT(jsonRequest({ emailEnabled: false, domains: { accounting: false } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(VIEW);
    expect(mockUpdatePreferences).toHaveBeenCalledWith("user-1", { emailEnabled: false, domains: { accounting: false } });
  });

  it("rejette une clé de domaine inconnue ou non visible pour l'appelant (400)", async () => {
    const res = await PUT(jsonRequest({ domains: { jobs: true } }));
    expect(res.status).toBe(400);
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });

  it("userId toujours pris de la session, jamais du corps", async () => {
    await PUT(jsonRequest({ emailEnabled: true }));
    expect(mockGetVisibleDomainKeys).not.toHaveBeenCalled(); // pas de domains fourni ici
    expect(mockUpdatePreferences).toHaveBeenCalledWith("user-1", { emailEnabled: true });
  });

  it("401 sans session", async () => {
    mockRequireAuth.mockRejectedValue(new Error("UNAUTHORIZED"));
    const res = await PUT(jsonRequest({ emailEnabled: true }));
    expect(res.status).toBe(401);
  });

  it("corps invalide (type incorrect) → 400", async () => {
    const res = await PUT(jsonRequest({ emailEnabled: "oui" }));
    expect(res.status).toBe(400);
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });
});
