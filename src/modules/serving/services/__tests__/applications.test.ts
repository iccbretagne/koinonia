import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
process.env.SERVING_TOKEN_SECRET = "secret-de-test";
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const uploadFile = vi.fn();
const deleteMediaFile = vi.fn();
vi.mock("@/modules/storage", () => ({
  uploadFile: (...a: unknown[]) => uploadFile(...a),
  downloadFile: vi.fn(),
  deleteMediaFile: (...a: unknown[]) => deleteMediaFile(...a),
}));

const notifyUsers = vi.fn();
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  buildGenericNotificationEmail: (c: { title: string; message: string; link: string }) => ({
    subject: c.title,
    html: `${c.message} ${c.link}`,
  }),
}));

const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const { submitApplication, getApplication, rejectApplication, countServingQueue } = await import("../applications");
import type { ServingActor } from "../../auth";
import type { ApplicationData } from "../../schemas";

const CHURCH = "church-1";
const PVS = "dept-pvs";

const data: ApplicationData = {
  firstName: "Marie",
  lastName: "Kouassi",
  birthDate: new Date("1995-04-12T00:00:00Z"),
  profession: "Infirmière",
  maritalStatus: null,
  childrenCount: null,
  street: "1 rue de la Paix",
  city: "Rennes",
  postalCode: "35000",
  country: "France",
  phone: "0611223344",
  email: "marie@example.org",
  baptized: null,
  baptismDate: null,
  baptismPlace: null,
  previousChurch: null,
  previousChurchName: null,
  previousChurchLocation: null,
  pcncTrainings: [],
  hasServed: null,
  servedDepartment: null,
  ministryService: null,
  communityService: null,
  otherRoles: null,
  availableToServe: null,
  interests: null,
  observations: "Information très personnelle",
  journeyDetails: null,
  spiritualGoals: null,
  specificDetails: null,
};

function actor(canManage: boolean): ServingActor {
  return {
    session: {} as ServingActor["session"],
    userId: "user-1",
    user: { isSuperAdmin: false, churchRoles: [{ churchId: CHURCH, role: "ADMIN", ministryId: null, departments: [] }] },
    churchId: CHURCH,
    canManage,
    canEditSettings: canManage,
    pvsDeptIds: [PVS],
    linkedMemberIds: [],
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    ...data,
    id: "app-1",
    churchId: CHURCH,
    status: "RECEIVED",
    photoKey: "serving/church-1/x.jpg",
    consentAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    decidedAt: null,
    decidedById: null,
    rejectionReason: "motif interne",
    purgeWarnedAt: null,
    memberId: null,
    member: null,
    assignments: [],
    interviews: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.userDepartment.findMany.mockResolvedValue([{ userChurchRole: { userId: "pvs-head" } }]);
  prismaMock.memberUserLink.findMany.mockResolvedValue([]);
  prismaMock.department.findMany.mockResolvedValue([{ ministryId: "min-1", contactEmail: "pvs@eglise.fr" }]);
  prismaMock.userChurchRole.findMany.mockResolvedValue([]);
});

describe("submitApplication", () => {
  it("dépose la photo, enregistre la fiche et notifie le PVS sans donnée sensible", async () => {
    prismaMock.servingApplication.create.mockResolvedValue({ id: "app-1", firstName: "Marie", lastName: "Kouassi" });
    await submitApplication(CHURCH, [PVS], data, Buffer.from("jpeg"));

    expect(uploadFile).toHaveBeenCalledWith(expect.stringMatching(/^serving\/church-1\/.+\.jpg$/), expect.any(Buffer), "image/jpeg");
    const created = prismaMock.servingApplication.create.mock.calls[0][0].data;
    expect(created.churchId).toBe(CHURCH);
    expect(created.consentAt).toBeInstanceOf(Date);

    expect(notifyUsers).toHaveBeenCalledTimes(1);
    const [recipients, notif] = notifyUsers.mock.calls[0];
    expect(recipients).toEqual(["pvs-head"]);
    expect(notif).toMatchObject({ domain: "serving", type: "SERVING_NEW", link: "/personnes/candidatures/app-1" });
    const text = JSON.stringify(notif) + JSON.stringify(sendEmail.mock.calls);
    for (const secret of ["0611223344", "marie@example.org", "Information très personnelle", "Rennes", "1995"]) {
      expect(text).not.toContain(secret);
    }
    // Copie institutionnelle à l'adresse du PVS, lien seul
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ["pvs@eglise.fr"] }));
  });

  it("sans créneau libre, la fiche est « À planifier · aucun créneau » ; jeton de gestion rendu, empreinte seule stockée", async () => {
    prismaMock.servingInterviewSlot.findFirst.mockResolvedValue(null);
    prismaMock.servingApplication.create.mockResolvedValue({ id: "app-1", firstName: "Marie", lastName: "Kouassi" });
    const { manageToken } = await submitApplication(CHURCH, [PVS], data, Buffer.from("jpeg"));
    const created = prismaMock.servingApplication.create.mock.calls[0][0].data;
    expect(created.schedulingReason).toBe("NO_SLOT");
    expect(created.manageHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(created)).not.toContain(manageToken);
  });

  it("avec un créneau libre, pas de repère « À planifier »", async () => {
    prismaMock.servingInterviewSlot.findFirst.mockResolvedValue({ id: "s1" });
    prismaMock.servingApplication.create.mockResolvedValue({ id: "app-1", firstName: "Marie", lastName: "Kouassi" });
    await submitApplication(CHURCH, [PVS], data, Buffer.from("jpeg"));
    expect(prismaMock.servingApplication.create.mock.calls[0][0].data.schedulingReason).toBeUndefined();
  });

  it("retire la photo si l'enregistrement échoue", async () => {
    prismaMock.servingApplication.create.mockRejectedValue(new Error("db down"));
    await expect(submitApplication(CHURCH, [PVS], data, Buffer.from("jpeg"))).rejects.toThrow("db down");
    expect(deleteMediaFile).toHaveBeenCalledWith(uploadFile.mock.calls[0][0]);
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("sans responsable PVS identifié, notifie les Admins", async () => {
    prismaMock.userDepartment.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.findMany
      .mockResolvedValueOnce([]) // Ministres du PVS
      .mockResolvedValueOnce([{ userId: "admin-1" }]); // Admins
    prismaMock.servingApplication.create.mockResolvedValue({ id: "app-1", firstName: "Marie", lastName: "Kouassi" });
    await submitApplication(CHURCH, [PVS], data, Buffer.from("jpeg"));
    expect(notifyUsers.mock.calls[0][0]).toEqual(["admin-1"]);
  });
});

describe("getApplication", () => {
  it("journalise chaque consultation (VIEW)", async () => {
    prismaMock.servingApplication.findUnique.mockResolvedValue(record());
    const detail = await getApplication(actor(true), "app-1");
    expect(detail.firstName).toBe("Marie");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VIEW", entityType: "ServingApplication", entityId: "app-1" })
    );
  });

  it("refuse une candidature d'une autre église (404)", async () => {
    prismaMock.servingApplication.findUnique.mockResolvedValue(record({ churchId: "autre" }));
    await expect(getApplication(actor(true), "app-1")).rejects.toMatchObject({ statusCode: 404 });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("refuse un appelant sans droit sur la fiche, sans journaliser", async () => {
    prismaMock.servingApplication.findUnique.mockResolvedValue(record());
    await expect(getApplication(actor(false), "app-1")).rejects.toThrow("FORBIDDEN");
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("rejectApplication", () => {
  it("passe en non retenue et traite les renvois en attente", async () => {
    prismaMock.servingApplication.findUnique.mockResolvedValue(record());
    await rejectApplication(actor(true), "app-1", "Doublon");
    expect(prismaMock.servingApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED", rejectionReason: "Doublon" }) })
    );
    expect(prismaMock.servingAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { applicationId: "app-1", status: "SENT_BACK", resolvedAt: null } })
    );
  });

  it("annule un rendez-vous à venir, libère le créneau et envoie un message neutre", async () => {
    prismaMock.servingApplication.findUnique.mockResolvedValue(record());
    const booked = { id: "i1", applicationId: "app-1", slotId: "s1", status: "BOOKED", startsAt: new Date(Date.now() + 3 * 86_400_000), durationMinutes: 30, location: null, visioUrl: null, interviewerId: null };
    prismaMock.servingInterview.findFirst.mockResolvedValue(booked);
    prismaMock.servingInterview.update.mockResolvedValue({ ...booked, status: "CANCELLED", cancelReason: "REJECTED" });
    prismaMock.servingApplication.findUniqueOrThrow.mockResolvedValue({ id: "app-1", churchId: CHURCH, firstName: "Marie", lastName: "Kouassi", email: "marie@example.org", manageSalt: "salt" });
    await rejectApplication(actor(true), "app-1", "Motif interne");
    expect(prismaMock.servingInterview.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "CANCELLED", cancelReason: "REJECTED" } });
    expect(prismaMock.servingInterviewSlot.updateMany).toHaveBeenCalledWith({ where: { id: "s1" }, data: { bookedAt: null } });
    const mail = sendEmail.mock.calls.find((c) => (c[0].to as string[]).includes("marie@example.org"));
    expect(mail).toBeTruthy();
    expect(JSON.stringify(mail)).not.toContain("Motif interne");
  });

  it("refuse tant qu'un département suit la personne (409)", async () => {
    prismaMock.servingApplication.findUnique.mockResolvedValue(
      record({
        status: "VALIDATED",
        assignments: [{ status: "OBSERVATION", department: { id: "d", name: "Accueil", ministryId: "m" } }],
      })
    );
    await expect(rejectApplication(actor(true), "app-1", undefined)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("réservé au PVS et à l'administration", async () => {
    await expect(rejectApplication(actor(false), "app-1", undefined)).rejects.toThrow("FORBIDDEN");
  });
});

describe("countServingQueue (spec 092, file de l'Accueil)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PVS / Admin : compartiment « À traiter » de l'église (reçues, renvois non résolus)", async () => {
    prismaMock.servingApplication.count.mockResolvedValue(3);
    await expect(countServingQueue(actor(true))).resolves.toEqual({ view: "pvs", count: 3 });
    expect(prismaMock.servingApplication.count).toHaveBeenCalledWith({
      where: {
        churchId: CHURCH,
        OR: [
          { status: "RECEIVED" },
          { status: "VALIDATED", assignments: { some: { status: "SENT_BACK", resolvedAt: null } } },
        ],
      },
    });
  });

  it("sans département dirigé : aucune file (null, pas 0)", async () => {
    prismaMock.department.findMany.mockResolvedValue([{ id: "d1", ministryId: "m1" }]);
    await expect(countServingQueue(actor(false))).resolves.toBeNull();
    expect(prismaMock.servingAssignment.count).not.toHaveBeenCalled();
  });

  it("responsable : affectations en attente de ses départements, bornées à l'église", async () => {
    const lead: ServingActor = {
      ...actor(false),
      user: {
        isSuperAdmin: false,
        churchRoles: [{ churchId: CHURCH, role: "DEPARTMENT_HEAD", ministryId: null, departments: [{ department: { id: "d1" } }] }],
      } as ServingActor["user"],
    };
    prismaMock.department.findMany.mockResolvedValue([{ id: "d1", ministryId: "m1" }, { id: "d2", ministryId: "m1" }]);
    prismaMock.servingAssignment.count.mockResolvedValueOnce(4);
    prismaMock.servingApplication.count.mockResolvedValueOnce(2);
    await expect(countServingQueue(lead)).resolves.toEqual({ view: "department", count: 2 });
    expect(prismaMock.servingApplication.count).toHaveBeenLastCalledWith({
      where: { churchId: CHURCH, assignments: { some: { status: "PENDING", departmentId: { in: ["d1"] } } } },
    });
  });

  it("responsable sans aucune affectation dans ses départements : pas d'espace, pas de file", async () => {
    const lead: ServingActor = {
      ...actor(false),
      user: {
        isSuperAdmin: false,
        churchRoles: [{ churchId: CHURCH, role: "DEPARTMENT_HEAD", ministryId: null, departments: [{ department: { id: "d1" } }] }],
      } as ServingActor["user"],
    };
    prismaMock.department.findMany.mockResolvedValue([{ id: "d1", ministryId: "m1" }]);
    prismaMock.servingAssignment.count.mockResolvedValue(0);
    await expect(countServingQueue(lead)).resolves.toBeNull();
  });
});
