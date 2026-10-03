import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const { isTaskDue, runScheduledTasks } = await import("../cron-scheduler");

const at = (h: number, m = 0, day = 3) => new Date(2026, 9, day, h, m);

describe("isTaskDue", () => {
  it("every-run : toujours due", () => {
    expect(isTaskDue({ kind: "every-run" }, at(10, 0), at(10, 1))).toBe(true);
  });

  it("interval : due au premier passage, puis une fois l'intervalle écoulé (tolérance de 2 min)", () => {
    const hourly = { kind: "interval", minutes: 60 } as const;
    expect(isTaskDue(hourly, null, at(10))).toBe(true);
    expect(isTaskDue(hourly, at(10), at(10, 55))).toBe(false);
    expect(isTaskDue(hourly, at(10), at(10, 58))).toBe(true);
    expect(isTaskDue(hourly, at(10, 1), at(11, 0))).toBe(true);
  });

  it("daily : une fois par jour, à partir de l'heure donnée", () => {
    const daily = { kind: "daily", hour: 2 } as const;
    expect(isTaskDue(daily, null, at(1, 55))).toBe(false);
    expect(isTaskDue(daily, null, at(2, 0))).toBe(true);
    expect(isTaskDue(daily, at(2, 5, 2), at(2, 0))).toBe(true);
    expect(isTaskDue(daily, at(2, 0), at(14, 0))).toBe(false);
  });
});

describe("runScheduledTasks", () => {
  const now = at(10, 0);

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.cronTaskRun.findMany.mockResolvedValue([]);
    prismaMock.cronTaskRun.createMany.mockResolvedValue({ count: 1 });
    prismaMock.cronTaskRun.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.cronTaskRun.update.mockResolvedValue({});
  });

  it("une tâche jamais passée est créée, verrouillée, exécutée puis libérée", async () => {
    const run = vi.fn().mockResolvedValue({ sent: 2 });

    const outcomes = await runScheduledTasks([{ key: "t", schedule: { kind: "every-run" }, run }], now);

    expect(run).toHaveBeenCalledOnce();
    expect(outcomes.t).toMatchObject({ status: "ran", result: { sent: 2 } });
    expect(prismaMock.cronTaskRun.createMany).toHaveBeenCalledWith({
      data: [{ key: "t", lastStartedAt: now, lockedUntil: new Date(now.getTime() + 15 * 60_000) }],
      skipDuplicates: true,
    });
    expect(prismaMock.cronTaskRun.update).toHaveBeenCalledWith({
      where: { key: "t" },
      data: expect.objectContaining({ lastError: null, lockedUntil: null }),
    });
  });

  it("une tâche non due n'est ni verrouillée ni exécutée", async () => {
    prismaMock.cronTaskRun.findMany.mockResolvedValue([{ key: "t", lastStartedAt: at(9, 30) }]);
    const run = vi.fn();

    const outcomes = await runScheduledTasks([{ key: "t", schedule: { kind: "interval", minutes: 60 }, run }], now);

    expect(outcomes.t).toEqual({ status: "not-due" });
    expect(run).not.toHaveBeenCalled();
    expect(prismaMock.cronTaskRun.updateMany).not.toHaveBeenCalled();
  });

  it("prend la main en exigeant le lastStartedAt lu et un verrou libre ou échu", async () => {
    const seen = at(8, 0);
    prismaMock.cronTaskRun.findMany.mockResolvedValue([{ key: "t", lastStartedAt: seen }]);

    await runScheduledTasks([{ key: "t", schedule: { kind: "interval", minutes: 60 }, run: vi.fn() }], now);

    expect(prismaMock.cronTaskRun.updateMany).toHaveBeenCalledWith({
      where: { key: "t", lastStartedAt: seen, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      data: { lastStartedAt: now, lockedUntil: expect.any(Date) },
    });
  });

  it("une tâche prise par un autre appel n'est pas exécutée", async () => {
    prismaMock.cronTaskRun.findMany.mockResolvedValue([{ key: "a", lastStartedAt: at(8) }]);
    prismaMock.cronTaskRun.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.cronTaskRun.createMany.mockResolvedValue({ count: 0 });
    const runA = vi.fn();
    const runB = vi.fn();

    const outcomes = await runScheduledTasks(
      [
        { key: "a", schedule: { kind: "every-run" }, run: runA },
        { key: "b", schedule: { kind: "every-run" }, run: runB },
      ],
      now
    );

    expect(outcomes).toEqual({ a: { status: "locked" }, b: { status: "locked" } });
    expect(runA).not.toHaveBeenCalled();
    expect(runB).not.toHaveBeenCalled();
  });

  it("l'échec d'une tâche est consigné sans empêcher les autres", async () => {
    const ok = vi.fn().mockResolvedValue("ok");

    const outcomes = await runScheduledTasks(
      [
        { key: "ko", schedule: { kind: "every-run" }, run: vi.fn().mockRejectedValue(new Error("SMTP down")) },
        { key: "ok", schedule: { kind: "every-run" }, run: ok },
      ],
      now
    );

    expect(outcomes.ko).toMatchObject({ status: "failed", error: "SMTP down" });
    expect(outcomes.ok).toMatchObject({ status: "ran", result: "ok" });
    expect(prismaMock.cronTaskRun.update).toHaveBeenCalledWith({
      where: { key: "ko" },
      data: expect.objectContaining({ lastError: "SMTP down", lockedUntil: null }),
    });
  });
});
