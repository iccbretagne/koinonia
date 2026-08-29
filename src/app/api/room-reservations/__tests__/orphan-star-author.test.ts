// Spec 031/#463 — le STAR perd rooms:view/rooms:reserve, mais les réservations qu'il a
// créées avant ce changement doivent rester visibles et gérables par un rôle compétent,
// sans erreur d'affichage (T28). Rien ne relie ces routes à la permission ACTUELLE de
// l'auteur : elles ne lisent que createdById, jamais son rôle courant.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  requireAuth: () => mockRequireAuth(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/modules/rooms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/rooms")>()),
}));

const { GET } = await import("../route");
const { PATCH } = await import("../[id]/route");

// L'auteur historique (orphelin) n'a plus rooms:view — la ligne ne porte que son id.
const orphanReservation = {
  id: "res-1",
  churchId: "church-1",
  roomId: "room-1",
  title: "Répétition",
  startAt: new Date("2026-01-05T10:00:00Z"),
  endAt: new Date("2026-01-05T12:00:00Z"),
  status: "CONFIRMED",
  seriesId: null,
  isRecurrenceParent: false,
  createdById: "star-user-1",
  createdBy: { id: "star-user-1", name: "Ancien STAR", displayName: null },
  checklist: null,
};

describe("Réservations orphelines d'un STAR ayant perdu l'accès aux salles (spec 031/#463, T28)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET liste des réservations de l'église : la réservation d'un auteur STAR orphelin est renvoyée sans erreur", async () => {
    mockRequireChurchPermission.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.roomReservation.findMany.mockResolvedValue([orphanReservation] as never);

    const res = await GET(new Request("http://localhost/api/room-reservations?churchId=church-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reservations).toHaveLength(1);
    expect(body.reservations[0].createdBy).toEqual({ id: "star-user-1", name: "Ancien STAR" });
  });

  it("PATCH annulation par un gestionnaire de salles (Admin, non créateur) réussit malgré l'auteur orphelin", async () => {
    prismaMock.roomReservation.findUnique.mockResolvedValue(orphanReservation as never);
    mockRequireAuth.mockResolvedValue(createAdminSession("church-1"));
    prismaMock.roomReservation.findMany.mockResolvedValue([orphanReservation] as never);
    prismaMock.roomReservation.updateMany.mockResolvedValue({ count: 1 } as never);

    const request = new Request("http://localhost/api/room-reservations/res-1", {
      method: "PATCH",
      body: JSON.stringify({ action: "cancel", scope: "occurrence" }),
    });
    const res = await PATCH(request, { params: Promise.resolve({ id: "res-1" }) });
    expect(res.status).toBe(200);
  });
});
