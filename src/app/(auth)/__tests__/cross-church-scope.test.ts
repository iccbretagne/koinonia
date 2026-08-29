/**
 * Issue #490 — les pages media/requests, secretariat/requests et communication/requests
 * calculaient userPermissions/userDeptIds sur TOUS les churchRoles de l'utilisateur, pas
 * seulement ceux de l'église courante (même défaut que dashboard/page.tsx, corrigé en
 * spec 031/T19). Conséquence : un Secrétaire de l'église B obtenait events:manage en
 * consultant l'église A où il n'a aucun rôle.
 *
 * Composant serveur = fonction async : on l'appelle directement (pas de rendu DOM),
 * comme dans audio-block.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

const churchIdA = "church-A";
const churchIdB = "church-B";

const foreignSecretary = {
  isSuperAdmin: false,
  churchRoles: [
    { churchId: churchIdB, role: "SECRETARY", departments: [] },
  ],
};

function mockAuth(user: typeof foreignSecretary) {
  vi.doMock("@/lib/auth", () => ({
    requireAuth: vi.fn().mockResolvedValue({ user }),
    getCurrentChurchId: vi.fn().mockResolvedValue(churchIdA),
    requireChurchPermission: vi.fn().mockResolvedValue(undefined),
  }));
}

describe("Cross-tenant : événements 'requests' d'un autre secrétaire ne donnent pas accès", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("media/requests : notFound() pour un events:manage valable uniquement dans une autre église", async () => {
    mockAuth(foreignSecretary);
    const { notFound } = await import("next/navigation");
    prismaMock.department.findFirst.mockResolvedValue({ id: "dept-media", name: "Média" } as never);

    const MediaRequestsPage = (await import("../media/requests/page")).default;
    await MediaRequestsPage();

    expect(notFound).toHaveBeenCalled();
  });

  it("secretariat/requests : notFound() pour un events:manage valable uniquement dans une autre église", async () => {
    mockAuth(foreignSecretary);
    const { notFound } = await import("next/navigation");
    prismaMock.department.findFirst.mockResolvedValue({ id: "dept-secr", name: "Secrétariat" } as never);

    const SecretariatRequestsPage = (await import("../secretariat/requests/page")).default;
    await SecretariatRequestsPage();

    expect(notFound).toHaveBeenCalled();
  });

  it("communication/requests : notFound() pour un events:manage valable uniquement dans une autre église", async () => {
    mockAuth(foreignSecretary);
    const { notFound } = await import("next/navigation");
    prismaMock.department.findFirst.mockResolvedValue({ id: "dept-comm", name: "Communication" } as never);

    const CommunicationRequestsPage = (await import("../communication/requests/page")).default;
    await CommunicationRequestsPage();

    expect(notFound).toHaveBeenCalled();
  });
});
