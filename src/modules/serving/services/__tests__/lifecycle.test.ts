import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
const deleteMediaFile = vi.fn();
vi.mock("@/modules/storage", () => ({
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
  deleteMediaFile: (...a: unknown[]) => deleteMediaFile(...a),
}));
const notifyUsers = vi.fn();
const deleteItemNotifications = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notifyUsers: (...a: unknown[]) => notifyUsers(...a),
  deleteItemNotifications: (...a: unknown[]) => deleteItemNotifications(...a),
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(), buildGenericNotificationEmail: () => ({ subject: "", html: "" }) }));
vi.mock("@/lib/function-departments", () => ({ getFunctionDepartmentIds: vi.fn().mockResolvedValue(["dept-pvs"]) }));

const { runServingTasks } = await import("../lifecycle");

const NOW = new Date("2026-10-28T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

function obs(id: string, endsInDays: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    status: "OBSERVATION",
    observationEndsAt: day(endsInDays),
    endingReminderAt: null,
    overdueRemindedAt: null,
    department: { id: "dept-1", name: "Accueil" },
    application: { id: `app-${id}`, churchId: "church-1", firstName: "Marie", lastName: "Kouassi" },
    ...extra,
  };
}

function app(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    churchId: "church-1",
    status: "RECEIVED",
    photoKey: "serving/church-1/app-1.jpg",
    firstName: "Marie",
    lastName: "Kouassi",
    createdAt: day(-300),
    decidedAt: null,
    purgeWarnedAt: null,
    assignments: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.servingAssignment.findMany.mockResolvedValue([]);
  prismaMock.servingApplication.findMany.mockResolvedValue([]);
  prismaMock.servingAssignment.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.servingApplication.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.servingSettings.findUnique.mockResolvedValue({ observationMonths: 3, retentionMonths: 12 });
  prismaMock.userDepartment.findMany.mockResolvedValue([{ userChurchRole: { userId: "u-1" } }]);
  prismaMock.userChurchRole.findMany.mockResolvedValue([]);
  prismaMock.memberUserLink.findMany.mockResolvedValue([]);
  prismaMock.department.findUnique.mockResolvedValue({ ministryId: "min-1" });
  prismaMock.department.findMany.mockResolvedValue([{ ministryId: "min-pvs" }]);
});

describe("rappels d'observation", () => {
  it("rappel de fin proche, réservé par horodatage", async () => {
    prismaMock.servingAssignment.findMany.mockResolvedValue([obs("a", 10)]);
    const res = await runServingTasks(NOW);
    expect(res.endingReminders).toBe(1);
    expect(prismaMock.servingAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: "a", status: "OBSERVATION", endingReminderAt: null },
      data: { endingReminderAt: NOW },
    });
    expect(notifyUsers.mock.calls[0][1].type).toBe("SERVING_OBSERVATION_ENDING");
  });

  it("relance d'une observation échue, au plus tous les 7 jours", async () => {
    prismaMock.servingAssignment.findMany.mockResolvedValue([obs("b", -3)]);
    const res = await runServingTasks(NOW);
    expect(res.overdueReminders).toBe(1);
    const where = prismaMock.servingAssignment.updateMany.mock.calls[0][0].where;
    expect(where.OR[1].overdueRemindedAt.lte).toEqual(day(-7));
    expect(notifyUsers.mock.calls[0][1].type).toBe("SERVING_OBSERVATION_OVERDUE");
  });

  it("n'envoie rien si un autre passage a déjà réservé l'envoi", async () => {
    prismaMock.servingAssignment.findMany.mockResolvedValue([obs("c", -3)]);
    prismaMock.servingAssignment.updateMany.mockResolvedValue({ count: 0 });
    const res = await runServingTasks(NOW);
    expect(res.overdueReminders).toBe(0);
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});

describe("conservation", () => {
  it("avertit le PVS un mois avant l'effacement d'une candidature jamais traitée", async () => {
    // Reçue il y a 11 mois et demi : effacement dans ~2 semaines
    prismaMock.servingApplication.findMany.mockResolvedValue([app({ createdAt: day(-350) })]);
    const res = await runServingTasks(NOW);
    expect(res.purgeWarnings).toBe(1);
    expect(notifyUsers.mock.calls[0][1].type).toBe("SERVING_PURGE_WARNING");
    expect(deleteMediaFile).not.toHaveBeenCalled();
  });

  it("pas d'avertissement pour une candidature non retenue", async () => {
    prismaMock.servingApplication.findMany.mockResolvedValue([app({ status: "REJECTED", decidedAt: day(-350) })]);
    const res = await runServingTasks(NOW);
    expect(res.purgeWarnings).toBe(0);
  });

  it("efface la photo, puis la ligne et ses notifications, à échéance", async () => {
    prismaMock.servingApplication.findMany.mockResolvedValue([app({ createdAt: day(-400) })]);
    const res = await runServingTasks(NOW);
    expect(res.purged).toBe(1);
    expect(deleteMediaFile).toHaveBeenCalledWith("serving/church-1/app-1.jpg");
    expect(prismaMock.servingApplication.delete).toHaveBeenCalledWith({ where: { id: "app-1" } });
    expect(deleteItemNotifications).toHaveBeenCalledWith(prismaMock, "ServingApplication", "app-1", ["/candidatures/app-1"]);
    expect(deleteMediaFile.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.servingApplication.delete.mock.invocationCallOrder[0]
    );
  });

  it("garde la ligne si la photo n'a pas pu être effacée (nouvel essai au passage suivant)", async () => {
    prismaMock.servingApplication.findMany.mockResolvedValue([app({ createdAt: day(-400) })]);
    deleteMediaFile.mockRejectedValueOnce(new Error("S3 down"));
    const res = await runServingTasks(NOW);
    expect(res.purged).toBe(0);
    expect(prismaMock.servingApplication.delete).not.toHaveBeenCalled();
  });

  it("ne cherche que des candidatures sans affectation active", async () => {
    await runServingTasks(NOW);
    expect(prismaMock.servingApplication.findMany.mock.calls[0][0].where).toEqual({
      assignments: { none: { status: { in: ["PENDING", "OBSERVATION", "CONFIRMED"] } } },
    });
  });

  it("respecte une durée de conservation réglée par l'église", async () => {
    prismaMock.servingSettings.findUnique.mockResolvedValue({ observationMonths: 3, retentionMonths: 24 });
    prismaMock.servingApplication.findMany.mockResolvedValue([app({ createdAt: day(-400) })]);
    const res = await runServingTasks(NOW);
    expect(res.purged).toBe(0);
  });
});
