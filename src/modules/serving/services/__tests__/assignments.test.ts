import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { ApiError } from "@/lib/api-utils";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/modules/storage", () => ({ uploadFile: vi.fn(), downloadFile: vi.fn(), deleteMediaFile: vi.fn() }));

const notifyUsers = vi.fn();
vi.mock("@/lib/notifications", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a) }));
const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  buildGenericNotificationEmail: (c: { title: string }) => ({ subject: c.title, html: "" }),
}));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const { assignApplication, acceptAssignment, confirmAssignment, sendBackAssignment } = await import("../assignments");
const { toOwnApplicationView } = await import("../own");
import type { ServingActor } from "../../auth";

const CHURCH = "church-1";
const DEPT = { id: "dept-accueil", name: "Accueil", ministryId: "min-1" };

function actor(opts: { canManage?: boolean; lead?: boolean } = {}): ServingActor {
  return {
    session: {} as ServingActor["session"],
    userId: "user-1",
    user: {
      isSuperAdmin: false,
      churchRoles: opts.lead
        ? [{ churchId: CHURCH, role: "DEPARTMENT_HEAD", ministryId: null, departments: [{ department: { id: DEPT.id } }] }]
        : [{ churchId: CHURCH, role: "ADMIN", ministryId: null, departments: [] }],
    },
    churchId: CHURCH,
    canManage: opts.canManage ?? false,
    canEditSettings: false,
    pvsDeptIds: ["dept-pvs"],
    linkedMemberIds: [],
  };
}

function app(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    churchId: CHURCH,
    status: "RECEIVED",
    firstName: "Marie",
    lastName: "Kouassi",
    email: "marie@example.org",
    phone: "0611223344",
    memberId: null,
    member: null,
    assignments: [],
    ...overrides,
  };
}

function assignment(status: string, appOverrides: Record<string, unknown> = {}) {
  return {
    id: "asg-1",
    status,
    departmentId: DEPT.id,
    department: DEPT,
    application: { id: "app-1", churchId: CHURCH, firstName: "Marie", lastName: "Kouassi", email: "m@x.fr", phone: null, memberId: null, ...appOverrides },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.userDepartment.findMany.mockResolvedValue([{ userChurchRole: { userId: "lead-1" } }]);
  prismaMock.userChurchRole.findMany.mockResolvedValue([]);
  prismaMock.memberUserLink.findMany.mockResolvedValue([]);
  prismaMock.servingSettings.findUnique.mockResolvedValue({ observationMonths: 2, retentionMonths: 12 });
  prismaMock.servingAssignment.updateMany.mockResolvedValue({ count: 1 });
});

describe("assignApplication", () => {
  it("crée les affectations, valide la candidature et notifie chaque département", async () => {
    prismaMock.servingApplication.findUnique.mockResolvedValue(app());
    prismaMock.department.findMany.mockResolvedValue([{ id: DEPT.id, name: DEPT.name }]);
    prismaMock.department.findUnique.mockResolvedValue({ ministryId: DEPT.ministryId });
    await assignApplication(actor({ canManage: true }), "app-1", [DEPT.id, DEPT.id]);

    expect(prismaMock.servingAssignment.createMany).toHaveBeenCalledWith({
      data: [{ applicationId: "app-1", departmentId: DEPT.id, assignedById: "user-1" }],
    });
    expect(prismaMock.servingApplication.update.mock.calls[0][0].data).toMatchObject({ status: "VALIDATED", decidedById: "user-1" });
    expect(notifyUsers).toHaveBeenCalledWith(["lead-1"], expect.objectContaining({ type: "SERVING_ASSIGNED", link: "/candidatures/app-1" }));
  });

  it("refuse un département système ou d'une autre église (400)", async () => {
    prismaMock.servingApplication.findUnique.mockResolvedValue(app());
    prismaMock.department.findMany.mockResolvedValue([]);
    await expect(assignApplication(actor({ canManage: true }), "app-1", ["ailleurs"])).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.servingAssignment.createMany).not.toHaveBeenCalled();
  });

  it("refuse un département qui suit déjà la personne (409)", async () => {
    prismaMock.servingApplication.findUnique.mockResolvedValue(
      app({ status: "VALIDATED", assignments: [{ status: "PENDING", departmentId: DEPT.id }] })
    );
    prismaMock.department.findMany.mockResolvedValue([{ id: DEPT.id, name: DEPT.name }]);
    await expect(assignApplication(actor({ canManage: true }), "app-1", [DEPT.id])).rejects.toMatchObject({ statusCode: 409 });
  });

  it("réservé au PVS et à l'administration", async () => {
    await expect(assignApplication(actor(), "app-1", [DEPT.id])).rejects.toThrow("FORBIDDEN");
  });
});

describe("acceptAssignment", () => {
  it("crée la fiche STAR, l'ajoute au département et fige la fin d'observation", async () => {
    prismaMock.servingAssignment.findUnique.mockResolvedValue(assignment("PENDING"));
    prismaMock.member.create.mockResolvedValue({ id: "member-1" });
    const attach = vi.fn().mockResolvedValue(undefined);

    await acceptAssignment(actor({ lead: true }), "asg-1", attach);

    expect(attach).toHaveBeenCalledWith("member-1", DEPT.id, CHURCH);
    expect(prismaMock.servingApplication.update).toHaveBeenCalledWith({ where: { id: "app-1" }, data: { memberId: "member-1" } });
    const update = prismaMock.servingAssignment.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: "asg-1", status: "PENDING" });
    expect(update.data.status).toBe("OBSERVATION");
    const months =
      (update.data.observationEndsAt.getUTCFullYear() - update.data.acceptedAt.getUTCFullYear()) * 12 +
      update.data.observationEndsAt.getUTCMonth() -
      update.data.acceptedAt.getUTCMonth();
    expect(months).toBe(2);
  });

  it("accepte une personne déjà membre du département (409 de l'ajout ignoré)", async () => {
    prismaMock.servingAssignment.findUnique.mockResolvedValue(assignment("PENDING", { memberId: "member-9" }));
    const attach = vi.fn().mockRejectedValue(new ApiError(409, "déjà"));
    await acceptAssignment(actor({ lead: true }), "asg-1", attach);
    expect(prismaMock.member.create).not.toHaveBeenCalled();
    expect(prismaMock.servingAssignment.updateMany).toHaveBeenCalled();
  });

  it("annule la fiche STAR créée si l'ajout échoue", async () => {
    prismaMock.servingAssignment.findUnique.mockResolvedValue(assignment("PENDING"));
    prismaMock.member.create.mockResolvedValue({ id: "member-1" });
    prismaMock.member.delete.mockResolvedValue({});
    const attach = vi.fn().mockRejectedValue(new ApiError(403, "autre église"));
    await expect(acceptAssignment(actor({ lead: true }), "asg-1", attach)).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.member.delete).toHaveBeenCalledWith({ where: { id: "member-1" } });
    expect(prismaMock.servingAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("refuse un appelant qui n'est pas du département", async () => {
    prismaMock.servingAssignment.findUnique.mockResolvedValue(assignment("PENDING"));
    await expect(acceptAssignment(actor({ canManage: true }), "asg-1", vi.fn())).rejects.toThrow("FORBIDDEN");
  });

  it("refuse une transition invalide (409)", async () => {
    prismaMock.servingAssignment.findUnique.mockResolvedValue(assignment("CONFIRMED"));
    await expect(acceptAssignment(actor({ lead: true }), "asg-1", vi.fn())).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("confirmAssignment", () => {
  it("confirme et notifie le PVS", async () => {
    prismaMock.servingAssignment.findUnique.mockResolvedValue(assignment("OBSERVATION"));
    await confirmAssignment(actor({ lead: true }), "asg-1");
    expect(prismaMock.servingAssignment.updateMany.mock.calls[0][0].data.status).toBe("CONFIRMED");
    expect(notifyUsers).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ type: "SERVING_CONFIRMED" }));
  });
});

describe("sendBackAssignment", () => {
  it("pendant l'observation, retire la personne du département et notifie le PVS", async () => {
    prismaMock.servingAssignment.findUnique.mockResolvedValue(assignment("OBSERVATION", { memberId: "member-1" }));
    prismaMock.department.findMany.mockResolvedValue([{ ministryId: "min-pvs", contactEmail: "pvs@eglise.fr" }]);
    const detach = vi.fn().mockResolvedValue(undefined);
    await sendBackAssignment(actor({ lead: true }), "asg-1", "Pas disponible", detach);

    expect(detach).toHaveBeenCalledWith("member-1", DEPT.id, CHURCH);
    expect(prismaMock.servingAssignment.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "SENT_BACK",
      sentBackReason: "Pas disponible",
    });
    const [, notif] = notifyUsers.mock.calls[0];
    expect(notif.type).toBe("SERVING_SENT_BACK");
    expect(JSON.stringify(notif)).not.toContain("Pas disponible");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ["pvs@eglise.fr"] }));
  });

  it("avant l'accueil, ne touche pas au département", async () => {
    prismaMock.servingAssignment.findUnique.mockResolvedValue(assignment("PENDING"));
    prismaMock.department.findMany.mockResolvedValue([]);
    const detach = vi.fn();
    await sendBackAssignment(actor({ lead: true }), "asg-1", "Pas le bon profil", detach);
    expect(detach).not.toHaveBeenCalled();
  });

  it("ignore une personne déjà retirée à la main (404)", async () => {
    prismaMock.servingAssignment.findUnique.mockResolvedValue(assignment("OBSERVATION", { memberId: "member-1" }));
    prismaMock.department.findMany.mockResolvedValue([]);
    const detach = vi.fn().mockRejectedValue(new ApiError(404, "absent"));
    await sendBackAssignment(actor({ lead: true }), "asg-1", "Motif", detach);
    expect(prismaMock.servingAssignment.updateMany).toHaveBeenCalled();
  });
});

describe("toOwnApplicationView (D8)", () => {
  const base = {
    id: "app-1",
    firstName: "Marie",
    lastName: "Kouassi",
    birthDate: new Date("1995-04-12T00:00:00Z"),
    baptismDate: null,
    pcncTrainings: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    rejectionReason: "interne",
  } as unknown as Parameters<typeof toOwnApplicationView>[0];

  it("sans accueil, pas de vue", () => {
    expect(
      toOwnApplicationView({ ...base, assignments: [{ status: "PENDING", observationEndsAt: null, department: { name: "Accueil" } }] })
    ).toBeNull();
  });

  it("ne montre que les départements d'accueil, sans renvoi ni motif", () => {
    const view = toOwnApplicationView({
      ...base,
      assignments: [
        { status: "SENT_BACK", observationEndsAt: null, department: { name: "Louange" } },
        { status: "OBSERVATION", observationEndsAt: new Date("2026-04-01T00:00:00Z"), department: { name: "Accueil" } },
      ],
    })!;
    expect(view.assignments).toEqual([
      { departmentName: "Accueil", status: "OBSERVATION", observationEndsAt: "2026-04-01T00:00:00.000Z" },
    ]);
    const text = JSON.stringify(view);
    expect(text).not.toContain("Louange");
    expect(text).not.toContain("interne");
  });
});
