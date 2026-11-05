import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const registry = { has: vi.fn(() => true) };
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/registry", () => ({ registry }));

const { isAssistantEnabled, setInstanceEnabled, setChurchDisabled } = await import("../services/settings");
const { incrementStats, readStats, statDay } = await import("../services/stats");
const { logAudit } = await import("@/lib/audit");

describe("activation de l'assistant (spec 075)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry.has.mockReturnValue(true);
  });

  it("est désactivé tant que le Super Admin ne l'a pas activé", async () => {
    prismaMock.assistantSettings.findUnique.mockResolvedValue(null);
    prismaMock.assistantChurchSetting.findUnique.mockResolvedValue(null);
    expect(await isAssistantEnabled("church-1")).toBe(false);
  });

  it("est actif si l'instance l'est et que l'église ne l'a pas coupé", async () => {
    prismaMock.assistantSettings.findUnique.mockResolvedValue({ id: "instance", enabled: true });
    prismaMock.assistantChurchSetting.findUnique.mockResolvedValue(null);
    expect(await isAssistantEnabled("church-1")).toBe(true);
  });

  it("est coupé pour une église qui l'a désactivé", async () => {
    prismaMock.assistantSettings.findUnique.mockResolvedValue({ id: "instance", enabled: true });
    prismaMock.assistantChurchSetting.findUnique.mockResolvedValue({ churchId: "church-1", disabled: true });
    expect(await isAssistantEnabled("church-1")).toBe(false);
  });

  it("est absent quand le module est désactivé ou sans église", async () => {
    registry.has.mockReturnValue(false);
    prismaMock.assistantSettings.findUnique.mockResolvedValue({ id: "instance", enabled: true });
    expect(await isAssistantEnabled("church-1")).toBe(false);
    registry.has.mockReturnValue(true);
    expect(await isAssistantEnabled(null)).toBe(false);
  });

  it("journalise les réglages d'instance et d'église", async () => {
    prismaMock.assistantSettings.findUnique.mockResolvedValue({ id: "instance", enabled: true });
    prismaMock.assistantChurchSetting.findUnique.mockResolvedValue({ churchId: "c", disabled: true });
    await setInstanceEnabled(true, { id: "sa" });
    await setChurchDisabled("c", true, { id: "admin" });
    expect(vi.mocked(logAudit).mock.calls.map((c) => c[0].entityType)).toEqual([
      "AssistantSettings",
      "AssistantChurchSetting",
    ]);
    expect(vi.mocked(logAudit).mock.calls[1][0].churchId).toBe("c");
  });
});

describe("compteurs d'usage (spec 075)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("incrémente les champs du jour, sans compte ni église", async () => {
    const now = new Date("2026-11-08T10:00:00Z");
    await incrementStats(["questions", "answered"], now);
    const call = prismaMock.assistantDailyStat.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ day: statDay(now) });
    expect(call.update).toEqual({ questions: { increment: 1 }, answered: { increment: 1 } });
    expect(call.create).toMatchObject({ questions: 1, answered: 1, unanswered: 0 });
    expect(JSON.stringify(call)).not.toMatch(/user|church/i);
  });

  it("n'échoue jamais sur une erreur d'écriture", async () => {
    prismaMock.assistantDailyStat.upsert.mockRejectedValueOnce(new Error("db"));
    await expect(incrementStats(["questions"])).resolves.toBeUndefined();
  });

  it("totalise une période et calcule la part « Utile »", async () => {
    prismaMock.assistantDailyStat.findMany.mockResolvedValue([
      { day: new Date("2026-11-01T00:00:00Z"), questions: 4, answered: 3, suggested: 1, unanswered: 0, dataAnswers: 1, helpful: 3, notHelpful: 1 },
      { day: new Date("2026-11-02T00:00:00Z"), questions: 2, answered: 1, suggested: 0, unanswered: 1, dataAnswers: 0, helpful: 0, notHelpful: 0 },
    ]);
    const stats = await readStats("2026-11-01", "2026-11-02");
    expect(stats.totals.questions).toBe(6);
    expect(stats.helpfulRate).toBe(0.75);
    expect(stats.days).toHaveLength(2);
  });
});
