import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { loadJobsBoard, loadPublication, toPublication } = await import("../services/board");

const session = (id: string, roles: string[]) => ({
  user: { id, isSuperAdmin: false, churchRoles: roles.map((role) => ({ role })) },
});
const NOW = new Date("2026-10-10T12:00:00.000Z");
const SEEN = new Date("2026-10-01T00:00:00.000Z");

const author = (id: string) => ({ id, name: `Nom ${id}`, displayName: null });
const offer = (over: Record<string, unknown> = {}) => ({
  id: "o1", title: "Développeur", status: "PUBLISHED", description: "…", type: "STAGE", company: "Acme",
  location: "Rennes", deadline: null, renewalRequestedAt: null, contactEmail: null, contactUrl: null,
  createdAt: new Date("2026-10-05T00:00:00.000Z"), authorId: "a", author: author("a"), ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  id: "x1", title: "Titre", status: "ACTIVE", description: "…", location: null, contactEmail: null, contactUrl: null,
  createdAt: new Date("2026-10-05T00:00:00.000Z"), authorId: "a", author: author("a"), ...over,
});
const ctx = { userId: "u", now: NOW, lastSeenAt: SEEN };

describe("toPublication", () => {
  it("dérive l'état : retirée, expirée, pourvue, a trouvé, indisponible, active", () => {
    expect(toPublication("OFFER", offer({ status: "ARCHIVED" }), ctx).state).toBe("retired");
    expect(toPublication("OFFER", offer({ deadline: new Date("2026-10-09T00:00:00.000Z") }), ctx).state).toBe("expired");
    expect(toPublication("OFFER", offer({ deadline: new Date("2026-10-20T00:00:00.000Z") }), ctx).state).toBe("active");
    expect(toPublication("MISSION", row({ status: "FILLED", domain: "Web" }), ctx).state).toBe("filled");
    expect(toPublication("SEEKER", row({ status: "FOUND" }), ctx).state).toBe("found");
    expect(toPublication("FREELANCE", row({ status: "UNAVAILABLE", domain: "Web" }), ctx).state).toBe("unavailable");
    expect(toPublication("SEEKER", row({ status: "ARCHIVED" }), ctx).state).toBe("retired");
  });

  it("« Nouveau » : opportunité active d'autrui parue depuis la dernière visite", () => {
    expect(toPublication("OFFER", offer(), ctx).isNew).toBe(true);
    expect(toPublication("MISSION", row({ domain: "Web" }), ctx).isNew).toBe(true);
    expect(toPublication("OFFER", offer({ authorId: "u" }), ctx).isNew).toBe(false);
    expect(toPublication("OFFER", offer({ createdAt: new Date("2026-09-20T00:00:00.000Z") }), ctx).isNew).toBe(false);
    expect(toPublication("OFFER", offer({ status: "ARCHIVED" }), ctx).isNew).toBe(false);
    expect(toPublication("SEEKER", row(), ctx).isNew).toBe(false);
  });

  it("construit l'adresse de détail de chaque sorte", () => {
    expect(toPublication("OFFER", offer(), ctx).href).toBe("/jobs/o1");
    expect(toPublication("MISSION", row(), ctx).href).toBe("/jobs/freelance/missions/x1");
    expect(toPublication("SEEKER", row(), ctx).href).toBe("/jobs/seekers/x1");
    expect(toPublication("FREELANCE", row(), ctx).href).toBe("/jobs/freelance/profiles/x1");
  });

  it("garde tous les contrats visés par un profil en recherche", () => {
    const pub = toPublication("SEEKER", row({ wantEmploi: true, wantStage: false, wantAlternance: true, sector: "BTP" }), ctx);
    expect(pub.contractTypes).toEqual(["EMPLOI", "ALTERNANCE"]);
    expect(pub.organization).toBe("BTP");
  });
});

describe("loadJobsBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.jobLastSeen.findUnique.mockResolvedValue({ seenAt: SEEN } as never);
    prismaMock.jobOffer.findMany.mockResolvedValue([offer()] as never);
    prismaMock.freelanceMission.findMany.mockResolvedValue([row({ id: "m1", domain: "Web", createdAt: new Date("2026-10-07T00:00:00.000Z") })] as never);
    prismaMock.jobSeeker.findMany.mockResolvedValue([] as never);
    prismaMock.freelanceProfile.findMany.mockResolvedValue([] as never);
  });

  it("borne un non-modérateur aux publications actives et aux siennes", async () => {
    const board = await loadJobsBoard(session("u", ["STAR"]), { now: NOW });
    expect(board.canManage).toBe(false);
    expect(prismaMock.jobOffer.findMany.mock.calls[0][0]!.where).toEqual({
      OR: [{ status: "PUBLISHED", OR: [{ deadline: null }, { deadline: { gte: NOW } }] }, { authorId: "u" }],
    });
    expect(prismaMock.jobSeeker.findMany.mock.calls[0][0]!.where).toEqual({ OR: [{ status: "ACTIVE" }, { authorId: "u" }] });
  });

  it("ne filtre rien pour un modérateur", async () => {
    const board = await loadJobsBoard(session("u", ["SECRETARY"]), { now: NOW });
    expect(board.canManage).toBe(true);
    expect(prismaMock.jobOffer.findMany.mock.calls[0][0]!.where).toEqual({});
    expect(prismaMock.freelanceMission.findMany.mock.calls[0][0]!.where).toEqual({});
  });

  it("fusionne les sortes, de la plus récente à la plus ancienne, avec la date de dernière visite", async () => {
    const board = await loadJobsBoard(session("u", ["STAR"]), { now: NOW });
    expect(board.publications.map((p) => p.id)).toEqual(["m1", "o1"]);
    expect(board.lastSeenAt).toBe(SEEN.toISOString());
  });

  it("prend une fenêtre de 30 jours à la première visite", async () => {
    prismaMock.jobLastSeen.findUnique.mockResolvedValue(null);
    const board = await loadJobsBoard(session("u", ["STAR"]), { now: NOW });
    expect(board.lastSeenAt).toBe(new Date(NOW.getTime() - 30 * 86_400_000).toISOString());
  });
});

describe("loadPublication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renvoie null si la publication n'existe pas", async () => {
    prismaMock.jobSeeker.findUnique.mockResolvedValue(null);
    expect(await loadPublication(session("u", ["STAR"]), "SEEKER", "x1", { now: NOW })).toBeNull();
  });

  it("cache à un tiers une publication non active", async () => {
    prismaMock.freelanceMission.findUnique.mockResolvedValue(row({ status: "FILLED", authorId: "a" }) as never);
    expect(await loadPublication(session("u", ["STAR"]), "MISSION", "x1", { now: NOW })).toBeNull();
  });

  it("la montre à son auteur et à un modérateur", async () => {
    prismaMock.freelanceMission.findUnique.mockResolvedValue(row({ status: "ARCHIVED", authorId: "u" }) as never);
    const own = await loadPublication(session("u", ["STAR"]), "MISSION", "x1", { now: NOW });
    expect(own?.publication.isOwn).toBe(true);
    expect(own?.canManage).toBe(false);

    prismaMock.jobOffer.findUnique.mockResolvedValue(offer({ status: "ARCHIVED" }) as never);
    const moderated = await loadPublication(session("m", ["ADMIN"]), "OFFER", "o1", { now: NOW });
    expect(moderated?.publication.state).toBe("retired");
    expect(moderated?.canManage).toBe(true);
  });
});
