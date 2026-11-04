import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { notificationMocks, rejection } from "./helpers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications", () => notificationMocks);
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { receptionSnapshot } = await import("../services/snapshot");
const { createAssignment, listAssignmentsForUser } = await import("../services/team");
const { hashToken } = await import("../services/tokens");

describe("instantané de l'accueil et équipe (spec 074, lot 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "secret-de-test";
  });

  it("l'accueil ne reçoit ni email, ni téléphone de contact, ni montant d'option", async () => {
    prismaMock.ticketingEvent.findUniqueOrThrow.mockResolvedValue({ id: "ev-1", title: "Nuit", capacity: 100, allowWalkIns: true, startsAt: new Date(), endsAt: new Date(), tariffs: [] });
    prismaMock.ticketingBooking.findMany.mockResolvedValue([
      {
        id: "bk-1",
        reference: "NT30-0042",
        scanTokenHash: "s".repeat(64),
        guardianName: "Maman",
        guardianPhone: "0600000000",
        participants: [{ id: "p1", firstName: "Léo", lastName: "K", ageGroup: "TEEN", ticketTokenHash: "t".repeat(64), status: "ACTIVE", entryPrice: 5, entryStatus: "DUE" }],
      },
    ]);
    prismaMock.ticketingAssignment.findMany.mockResolvedValue([]);
    prismaMock.ticketingPassage.findMany.mockResolvedValue([]);
    const snap = await receptionSnapshot("ev-1");
    const select = prismaMock.ticketingBooking.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("contactEmail");
    expect(select).not.toHaveProperty("contactPhone");
    expect(select).not.toHaveProperty("items");
    const text = JSON.stringify(snap);
    expect(text).not.toMatch(/@/);
    expect(snap.participants[0]).toMatchObject({ entryDue: 5, unaccompanied: true, guardianPhone: "0600000000", ticketHash: "t".repeat(64) });
  });

  it("une affectation exige un compte de l'église ou un nom d'intervenant ; le badge n'est stocké qu'en empreinte", async () => {
    prismaMock.ticketingEvent.findUniqueOrThrow.mockResolvedValue({ churchId: "church-1", title: "Nuit", startsAt: new Date() });
    expect((await rejection(createAssignment("ev-1", "org-1", {}))).statusCode).toBe(400);
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    expect((await rejection(createAssignment("ev-1", "org-1", { userId: "outsider" }))).statusCode).toBe(400);
    prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "r" });
    prismaMock.ticketingAssignment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, post: null }));
    await createAssignment("ev-1", "org-1", { userId: "star-1" });
    const data = prismaMock.ticketingAssignment.create.mock.calls[0][0].data;
    expect(data.badgeTokenHash).toHaveLength(64);
    expect(notificationMocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "star-1", domain: "ticketing", link: "/planning" }));
  });

  it("« Mon planning » reçoit le badge, dont l'empreinte correspond à celle stockée", async () => {
    prismaMock.ticketingAssignment.findMany.mockResolvedValue([
      { id: "as-1", tokenSalt: "salt", startsAt: null, endsAt: null, post: { name: "Porte" }, event: { id: "ev-1", title: "Nuit", startsAt: new Date(), endsAt: new Date(), location: null } },
    ]);
    const [a] = await listAssignmentsForUser("star-1");
    expect(a.postName).toBe("Porte");
    const token = a.badge.replace("KOINONIA-BADGE:", "");
    const { tokenPair } = await import("../services/tokens");
    expect(hashToken(token)).toBe(tokenPair("badge", "as-1", "salt").hash);
  });
});
