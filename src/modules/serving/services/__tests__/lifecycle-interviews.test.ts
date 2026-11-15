import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next-auth", () => ({ default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }) }));
vi.mock("@/modules/storage", () => ({ uploadFile: vi.fn(), downloadFile: vi.fn(), deleteMediaFile: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifyUsers: vi.fn(), deleteItemNotifications: vi.fn() }));
vi.mock("@/lib/function-departments", () => ({ getFunctionDepartmentIds: vi.fn().mockResolvedValue(["dept-pvs"]) }));
const n = {
  notifyInterviewReminder: vi.fn(),
  notifyInterviewToComplete: vi.fn(),
  notifySchedulingReminder: vi.fn(),
  emailSlotsInvitation: vi.fn(),
  notifyInterviewCancelled: vi.fn(),
};
vi.mock("../notifications", async (orig) => ({
  ...(await orig<typeof import("../notifications")>()),
  notifyInterviewReminder: (...a: unknown[]) => n.notifyInterviewReminder(...a),
  notifyInterviewToComplete: (...a: unknown[]) => n.notifyInterviewToComplete(...a),
  notifySchedulingReminder: (...a: unknown[]) => n.notifySchedulingReminder(...a),
  emailSlotsInvitation: (...a: unknown[]) => n.emailSlotsInvitation(...a),
  notifyInterviewCancelled: (...a: unknown[]) => n.notifyInterviewCancelled(...a),
}));

const { runServingTasks } = await import("../lifecycle");

// 15 novembre 2026, 19 h à Paris.
const NOW = new Date("2026-11-15T18:00:00Z");
const DAY = 86_400_000;
const interview = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  applicationId: "app-1",
  slotId: "s1",
  status: "BOOKED",
  startsAt: new Date("2026-11-16T09:00:00Z"),
  durationMinutes: 30,
  location: null,
  visioUrl: null,
  interviewerId: "u-pvs",
  dayBeforeRemindedAt: null,
  completionRemindedAt: null,
  ...over,
});

type Where = { where?: Record<string, unknown> };
let dayBefore: unknown[];
let toComplete: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  dayBefore = [];
  toComplete = [];
  prismaMock.servingAssignment.findMany.mockResolvedValue([]);
  prismaMock.servingApplication.findMany.mockResolvedValue([]);
  prismaMock.servingSettings.findMany.mockResolvedValue([]);
  prismaMock.servingSettings.findUnique.mockResolvedValue(null);
  prismaMock.servingInterview.findMany.mockImplementation(async ({ where }: Where) =>
    where && "dayBeforeRemindedAt" in where ? dayBefore : where && "completionRemindedAt" in where ? toComplete : []
  );
  prismaMock.servingInterview.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.servingApplication.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.servingApplication.findUniqueOrThrow.mockResolvedValue({ id: "app-1", churchId: "church-1", firstName: "Marie", lastName: "K", email: "m@x.fr", manageSalt: "s" });
  process.env.SERVING_TOKEN_SECRET = "test-secret";
});

describe("rappel de la veille", () => {
  it("rappel unique pour un entretien de demain (jour de Paris), pris de façon atomique", async () => {
    dayBefore = [interview(), interview({ id: "i2", startsAt: new Date("2026-11-17T09:00:00Z") })];
    const r = await runServingTasks(NOW);
    expect(r.interviewReminders).toBe(1);
    expect(prismaMock.servingInterview.updateMany).toHaveBeenCalledWith({ where: { id: "i1", dayBeforeRemindedAt: null, status: "BOOKED" }, data: { dayBeforeRemindedAt: NOW } });
    prismaMock.servingInterview.updateMany.mockResolvedValue({ count: 0 });
    vi.clearAllMocks();
    expect((await runServingTasks(NOW)).interviewReminders).toBe(0);
    expect(n.notifyInterviewReminder).not.toHaveBeenCalled();
  });
});

describe("issue à noter", () => {
  it("notifie 12 h après la fin, pas avant", async () => {
    toComplete = [interview({ startsAt: new Date(NOW.getTime() - 13 * 3_600_000) }), interview({ id: "i3", startsAt: new Date(NOW.getTime() - 3 * 3_600_000) })];
    const r = await runServingTasks(NOW);
    expect(r.completionReminders).toBe(1);
    expect(n.notifyInterviewToComplete).toHaveBeenCalledOnce();
  });
});

describe("relance « À planifier »", () => {
  const app = (over: Record<string, unknown>) => ({ id: "app-1", churchId: "church-1", schedulingReason: "NO_SLOT", schedulingSince: new Date(NOW.getTime() - 15 * DAY), schedulingRemindedAt: null, ...over });

  it("au délai de l'église (14 jours par défaut), puis à chaque nouveau délai", async () => {
    prismaMock.servingApplication.findMany.mockImplementation(async ({ where }: Where) =>
      where && "schedulingSince" in where
        ? [app({}), app({ id: "app-2", schedulingSince: new Date(NOW.getTime() - 5 * DAY) }), app({ id: "app-3", schedulingSince: new Date(NOW.getTime() - 40 * DAY), schedulingRemindedAt: new Date(NOW.getTime() - 10 * DAY) })]
        : []
    );
    const r = await runServingTasks(NOW);
    expect(r.schedulingReminders).toBe(1);
    expect(n.notifySchedulingReminder).toHaveBeenCalledWith(expect.anything(), "aucun créneau disponible");
  });

  it("délai réglé par l'église", async () => {
    prismaMock.servingSettings.findUnique.mockResolvedValue({ schedulingReminderDays: 3 });
    prismaMock.servingApplication.findMany.mockImplementation(async ({ where }: Where) =>
      where && "schedulingSince" in where ? [app({ schedulingSince: new Date(NOW.getTime() - 5 * DAY) })] : []
    );
    expect((await runServingTasks(NOW)).schedulingReminders).toBe(1);
  });
});

describe("invitation aux nouveaux créneaux", () => {
  it("une fois par vague et au plus une fois par jour, s'il reste un créneau libre", async () => {
    const opened = new Date(NOW.getTime() - 3_600_000);
    prismaMock.servingSettings.findMany.mockResolvedValue([{ churchId: "church-1", slotsOpenedAt: opened }]);
    prismaMock.servingInterviewSlot.count.mockResolvedValue(2);
    prismaMock.servingApplication.findMany.mockImplementation(async ({ where }: Where) =>
      where && "email" in where
        ? [
            { id: "app-1", slotsInvitedAt: null },
            { id: "app-2", slotsInvitedAt: new Date(NOW.getTime() - 2 * 3_600_000) }, // invitée il y a 2 h
          ]
        : []
    );
    expect((await runServingTasks(NOW)).slotsInvitations).toBe(1);
    prismaMock.servingInterviewSlot.count.mockResolvedValue(0);
    vi.clearAllMocks();
    expect((await runServingTasks(NOW)).slotsInvitations).toBe(0);
  });
});
