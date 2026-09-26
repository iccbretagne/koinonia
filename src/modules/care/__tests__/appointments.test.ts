import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  buildAppointmentConfirmationEmail: () => ({ subject: "Confirmation", html: "<p>ok</p>" }),
  buildAppointmentRejectedEmail: () => ({ subject: "Rejet", html: "<p>ok</p>" }),
}));
vi.mock("@/lib/notifications", () => ({
  notifyUsersWithRole: vi.fn().mockResolvedValue(undefined),
  notifyDeptMembers: vi.fn().mockResolvedValue(undefined),
  createNotification: vi.fn().mockResolvedValue(undefined),
  dispatchUserEmails: vi.fn().mockResolvedValue({ sent: 0, failed: 0 }),
}));
// `submitAppointmentRequest` (services/appointments.ts) importe `./followups`, qui importe
// `../auth` → `@/lib/auth` (NextAuth) au niveau module — mocké ici même si ce test n'exerce
// aucune garde de session (même besoin que pour tout module qui traverse cette chaîne).
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const { submitAppointmentRequest, listMyRequests } = await import("../services/appointments");

/**
 * T35 — le formulaire public et le formulaire connecté partagent le même service de dépôt :
 * ils créent donc une demande identique à l'état reçu (mêmes champs, sans jour préféré),
 * seul `userId` diffère (rattachement au compte, ou `null` pour le formulaire public).
 */
describe("submitAppointmentRequest — parité des deux points d'entrée (T35)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.church.findUnique.mockResolvedValue({ name: "ICC Rennes" });
    prismaMock.appointmentRequest.create.mockImplementation(async ({ data }) => ({
      id: "req-1",
      ...data,
    }));
  });

  const input = {
    churchId: "church-1",
    firstName: "Jean",
    lastName: "Dupont",
    email: "jean@example.org",
    phone: "0600000000",
    subject: "Renseignements",
    message: "Besoin d'un entretien.",
  };

  it("le dépôt public (userId null) et le dépôt connecté (userId défini) créent la même forme de demande", async () => {
    await submitAppointmentRequest(input, null);
    const publicCall = prismaMock.appointmentRequest.create.mock.calls.at(-1)?.[0];

    await submitAppointmentRequest(input, "user-1");
    const connectedCall = prismaMock.appointmentRequest.create.mock.calls.at(-1)?.[0];

    const { userId: publicUserId, ...publicRest } = publicCall.data;
    const { userId: connectedUserId, ...connectedRest } = connectedCall.data;

    expect(publicUserId).toBeNull();
    expect(connectedUserId).toBe("user-1");
    expect(publicRest).toEqual(connectedRest);
  });

  it("ne renseigne jamais preferredDays (retiré du dépôt, spec 052)", async () => {
    await submitAppointmentRequest(input, null);
    const call = prismaMock.appointmentRequest.create.mock.calls.at(-1)?.[0];
    expect(call.data.preferredDays).toBeUndefined();
  });

  it("la demande naît toujours PENDING, sans accompagnant assigné", async () => {
    await submitAppointmentRequest(input, "user-1");
    const call = prismaMock.appointmentRequest.create.mock.calls.at(-1)?.[0];
    expect(call.data.status).toBeUndefined(); // valeur par défaut du schéma (PENDING)
    expect(call.data.assignedToId).toBeUndefined();
  });
});

/**
 * T45, T57 — le demandeur connecté ne retrouve que ses propres demandes, sans accompagnant
 * (« Mes demandes », spec 052).
 */
describe("listMyRequests — limité à l'appelant (T45, T57)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filtre par churchId et userId, sans exposer l'accompagnant", async () => {
    prismaMock.appointmentRequest.findMany.mockResolvedValue([
      { id: "req-1", subject: "Besoin d'accompagnement", status: "PENDING", createdAt: new Date(), scheduledFor: null, rejectReasonCode: null, rejectReason: null },
    ] as never);

    const result = await listMyRequests("user-1", "church-1");

    expect(prismaMock.appointmentRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: "church-1", userId: "user-1" } })
    );
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("assignedToId");
    expect(result[0]).not.toHaveProperty("assignedMemberId");
  });
});
