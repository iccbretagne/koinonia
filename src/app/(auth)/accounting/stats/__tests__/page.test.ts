/** Page /accounting/stats : rendu initial à partir des statistiques partagées avec l'API. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const mockChurchId = vi.fn();
const mockRequire = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: async () => ({ user: { id: "u" } }),
  getCurrentChurchId: () => mockChurchId(),
  requireChurchPermission: (...a: unknown[]) => mockRequire(...a),
}));
const mockCompute = vi.fn();
vi.mock("@/modules/accounting", () => ({ computeAccountingStats: (...a: unknown[]) => mockCompute(...a) }));
vi.mock("../AccountingStats", () => ({ default: function AccountingStats() { return null; } }));
vi.mock("../../AccountingNav", () => ({ default: function AccountingNav() { return null; } }));

const Page = (await import("../page")).default;

describe("AccountingStatsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChurchId.mockResolvedValue("church-1");
    mockRequire.mockResolvedValue(undefined);
    mockCompute.mockResolvedValue({ period: "year" });
  });

  it("sans église courante ou sans accounting:stats, affiche un message", async () => {
    mockChurchId.mockResolvedValueOnce(null);
    const noChurch = (await Page()) as ReactElement<{ children: string }>;
    expect(noChurch.props.children).toBe("Aucune église sélectionnée.");
    mockRequire.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const denied = (await Page()) as ReactElement<{ children: string }>;
    expect(denied.props.children).toBe("Accès non autorisé.");
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it("transmet les statistiques de l'année au composant", async () => {
    const page = (await Page()) as ReactElement<{ children: ReactElement<Record<string, unknown>>[] }>;
    expect(mockCompute).toHaveBeenCalledWith("church-1", "year");
    expect(page.props.children[2].props).toEqual({ initialData: { period: "year" }, churchId: "church-1" });
  });
});
