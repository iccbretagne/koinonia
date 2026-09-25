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
}));

const { submitAppointmentRequest } = await import("../services/appointments");

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
