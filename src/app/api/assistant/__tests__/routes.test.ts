import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

const auth = {
  requireAuth: vi.fn(),
  getCurrentChurchId: vi.fn(),
  requireSuperAdmin: vi.fn(),
  requireChurchPermission: vi.fn(),
};
const assistant = {
  isAssistantEnabled: vi.fn(),
  ask: vi.fn(async () => ({ kind: "howto", key: "KB-021" })),
  recordFeedback: vi.fn(async () => ({ ok: true })),
  getInstanceSettings: vi.fn(async () => ({ enabled: false })),
  setInstanceEnabled: vi.fn(async (enabled: boolean) => ({ enabled })),
  getChurchSetting: vi.fn(async () => ({ instanceEnabled: true, disabled: false })),
  setChurchDisabled: vi.fn(async () => ({ instanceEnabled: true, disabled: true })),
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/modules/assistant", () => assistant);
vi.mock("../_viewer", () => ({ buildViewer: vi.fn(async () => ({ userId: "user-1", churchCount: 1 })) }));
vi.mock("../_data-questions", () => ({ dataCatalog: () => new Map() }));

const askRoute = await import("../ask/route");
const settingsRoute = await import("../settings/route");
const churchRoute = await import("../church/[churchId]/route");
const personaRoute = await import("../persona/route");

const post = (url: string, body: unknown, ip = "1.1.1.1") =>
  new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": ip } });

describe("routes de l'assistant (spec 075)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireAuth.mockResolvedValue({ user: { id: "user-1", isSuperAdmin: false, churchRoles: [] } });
    auth.getCurrentChurchId.mockResolvedValue("church-1");
    assistant.isAssistantEnabled.mockResolvedValue(true);
  });

  it("répond 404 quand l'assistant est coupé pour l'église", async () => {
    assistant.isAssistantEnabled.mockResolvedValue(false);
    const res = await askRoute.POST(post("http://x/api/assistant/ask", { question: "salut" }));
    expect(res.status).toBe(404);
    expect(assistant.ask).not.toHaveBeenCalled();
  });

  it("valide la question (1 à 300 caractères)", async () => {
    expect((await askRoute.POST(post("http://x/api/assistant/ask", { question: "" }))).status).toBe(400);
    expect((await askRoute.POST(post("http://x/api/assistant/ask", { question: "a".repeat(301) }))).status).toBe(400);
    expect((await askRoute.POST(post("http://x/api/assistant/ask", { question: "je suis pas dispo" }))).status).toBe(200);
  });

  it("limite le débit à 30 questions par minute et par compte", async () => {
    auth.requireAuth.mockResolvedValue({ user: { id: "user-debit", isSuperAdmin: false, churchRoles: [] } });
    const { buildViewer } = await import("../_viewer");
    vi.mocked(buildViewer).mockResolvedValue({ userId: "user-debit", churchCount: 1 } as never);
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await askRoute.POST(post("http://x/api/assistant/ask", { question: "salut" }))).status;
    expect(last).toBe(429);
  });

  it("réserve le réglage d'instance au Super Admin", async () => {
    auth.requireSuperAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await settingsRoute.PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ enabled: true }) }));
    expect(res.status).toBe(403);
    expect(assistant.setInstanceEnabled).not.toHaveBeenCalled();
  });

  it("coupe l'assistant d'une église avec church:settings dans cette église", async () => {
    auth.requireChurchPermission.mockResolvedValue({ user: { id: "admin-1" } });
    const res = await churchRoute.PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ disabled: true }) }), {
      params: Promise.resolve({ churchId: "church-9" }),
    });
    expect(res.status).toBe(200);
    expect(auth.requireChurchPermission).toHaveBeenCalledWith("church:settings", "church-9");
    expect(assistant.setChurchDisabled).toHaveBeenCalledWith("church-9", true, { id: "admin-1" });
  });

  it("enregistre le personnage choisi, Nia ou Koï seulement", async () => {
    const put = (persona: string) => personaRoute.PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ persona }) }));
    expect((await put("TIM")).status).toBe(400);
    expect((await put("KOI")).status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { assistantPersona: "KOI" } });
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect(await (await personaRoute.GET()).json()).toEqual({ persona: "NIA" });
  });
});
