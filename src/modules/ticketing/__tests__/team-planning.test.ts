import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { notificationMocks, rejection } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications", () => notificationMocks);
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { updateAssignment } = await import("../services/team");
const { listChurchAccounts, listChurchDepartments } = await import("../services/events");

const at = (h: number) => new Date(`2030-06-01T${String(h).padStart(2, "0")}:00:00Z`);
const assignment = { id: "as-1", eventId: "ev-1", postId: "door", userId: "star-1", startsAt: at(18), endsAt: at(22) };

describe("planning de l'équipe (spec 074)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.ticketingAssignment.findUnique.mockResolvedValue(assignment);
    prismaMock.ticketingPost.findUnique.mockResolvedValue({ id: "parking", eventId: "ev-1", name: "Parking" });
    prismaMock.ticketingEvent.findUniqueOrThrow.mockResolvedValue({ churchId: "church-1", title: "Nuit", startsAt: at(18) });
    prismaMock.ticketingAssignment.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...assignment,
      ...data,
      postId: data.postId === undefined ? assignment.postId : data.postId,
      post: { name: "Parking" },
    }));
  });

  it("change le poste et prévient la personne", async () => {
    await updateAssignment("ev-1", "as-1", "org-1", { postId: "parking" });
    expect(prismaMock.ticketingAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { postId: "parking", startsAt: at(18), endsAt: at(22) } })
    );
    expect(notificationMocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "star-1", title: "Nuit : votre affectation a changé", message: "Poste : Parking." })
    );
  });

  it("ne prévient personne quand rien ne change", async () => {
    await updateAssignment("ev-1", "as-1", "org-1", { startsAt: at(18) });
    expect(notificationMocks.createNotification).not.toHaveBeenCalled();
  });

  it("refuse un créneau à l'envers, un poste d'un autre événement, une affectation inconnue", async () => {
    expect((await rejection(updateAssignment("ev-1", "as-1", "org-1", { endsAt: at(17) }))).statusCode).toBe(400);
    prismaMock.ticketingPost.findUnique.mockResolvedValueOnce({ id: "x", eventId: "ev-2", name: "Ailleurs" });
    expect((await rejection(updateAssignment("ev-1", "as-1", "org-1", { postId: "x" }))).statusCode).toBe(404);
    prismaMock.ticketingAssignment.findUnique.mockResolvedValueOnce(null);
    expect((await rejection(updateAssignment("ev-1", "as-9", "org-1", { postId: null }))).statusCode).toBe(404);
    expect(prismaMock.ticketingAssignment.update).not.toHaveBeenCalled();
  });

  it("comptes avec leurs départements : responsabilités et fiche STAR liée, sans doublon", async () => {
    prismaMock.userChurchRole.findMany.mockResolvedValue([
      { user: { id: "u2", name: "Zoé", email: "z@example.org" }, departments: [] },
      { user: { id: "u1", name: "Awa", email: "a@example.org" }, departments: [{ departmentId: "son" }] },
      { user: { id: "u1", name: "Awa", email: "a@example.org" }, departments: [] },
    ]);
    prismaMock.memberUserLink.findMany.mockResolvedValue([
      { userId: "u1", member: { departments: [{ departmentId: "son" }, { departmentId: "accueil" }] } },
      { userId: "u2", member: { departments: [{ departmentId: "louange" }] } },
    ]);
    expect(await listChurchAccounts("church-1")).toEqual([
      { id: "u1", name: "Awa", email: "a@example.org", departmentIds: ["son", "accueil"] },
      { id: "u2", name: "Zoé", email: "z@example.org", departmentIds: ["louange"] },
    ]);
    expect(prismaMock.memberUserLink.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { churchId: "church-1", validatedAt: { not: null } } }));
  });

  it("départements de l'église avec leur ministère", async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "son", name: "Son", ministry: { name: "Louange" } }]);
    expect(await listChurchDepartments("church-1")).toEqual([{ id: "son", name: "Son", ministry: "Louange" }]);
  });
});
