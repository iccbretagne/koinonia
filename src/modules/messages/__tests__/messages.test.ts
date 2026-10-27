import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));
const resolveRecipients = vi.fn();
vi.mock("../services/audience", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/audience")>()),
  resolveRecipients: (...args: unknown[]) => resolveRecipients(...args),
}));
const dispatchDueMessages = vi.fn().mockResolvedValue({ notified: 0, recipients: 0 });
vi.mock("../services/dispatch", () => ({ dispatchDueMessages: () => dispatchDueMessages() }));

const { createMessage, updateMessage, withdrawMessage, messageStatus } = await import("../services/messages");
const { createSchema, updateSchema } = await import("../schemas");

const actor = { id: "u1" };
const HOUR = 3600 * 1000;
const ALL = { roles: [], ministryIds: [], departmentIds: [], headsOnly: false };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    churchId: "C1",
    title: "Maintenance",
    body: "Samedi",
    linkUrl: null,
    linkLabel: null,
    severity: "IMPORTANT",
    audience: ALL,
    startsAt: new Date(Date.now() - HOUR),
    endsAt: new Date(Date.now() + HOUR),
    withdrawnAt: null,
    notifiedAt: new Date(),
    recipientCount: 3,
    church: { name: "ICC Rennes" },
    ...overrides,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("messages système — gestion (spec 071)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRecipients.mockResolvedValue(["a", "b"]);
    prismaMock.systemMessage.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      row({ ...data, id: "m1", notifiedAt: null, recipientCount: null })
    );
    prismaMock.systemMessage.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      row(Object.fromEntries(Object.entries(data).filter(([k]) => k !== "updatedBy")))
    );
    prismaMock.ministry.count.mockResolvedValue(0);
    prismaMock.department.count.mockResolvedValue(0);
  });

  it("schéma : fin obligatoire, après le début, dans le futur, 90 jours au plus", () => {
    const base = { scope: "church", churchId: "C1", title: "T", body: "B", audience: ALL };
    expect(createSchema.safeParse({ ...base }).success).toBe(false);
    expect(createSchema.safeParse({ ...base, endsAt: new Date(Date.now() - HOUR) }).success).toBe(false);
    expect(
      createSchema.safeParse({ ...base, startsAt: new Date(Date.now() + 2 * HOUR), endsAt: new Date(Date.now() + HOUR) })
        .success
    ).toBe(false);
    expect(createSchema.safeParse({ ...base, endsAt: new Date(Date.now() + 100 * 24 * HOUR) }).success).toBe(false);
    expect(createSchema.safeParse({ ...base, endsAt: new Date(Date.now() + HOUR) }).success).toBe(true);
    expect(createSchema.safeParse({ ...base, endsAt: new Date(Date.now() + HOUR), linkUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("création immédiate : journal CREATE et envoi déclenché", async () => {
    const input = createSchema.parse({
      scope: "church",
      churchId: "C1",
      title: "Maintenance",
      body: "Samedi",
      severity: "IMPORTANT",
      audience: ALL,
      endsAt: new Date(Date.now() + HOUR),
    });
    const view = await createMessage(input, actor);
    expect(view.status).toBe("active");
    expect(view.author).toBe("Secrétariat de ICC Rennes");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "SystemMessage", churchId: "C1", userId: "u1" })
    );
    await flush();
    expect(dispatchDueMessages).toHaveBeenCalledOnce();
  });

  it("création programmée : pas d'envoi", async () => {
    const input = createSchema.parse({
      scope: "church",
      churchId: "C1",
      title: "T",
      body: "B",
      audience: ALL,
      startsAt: new Date(Date.now() + HOUR),
      endsAt: new Date(Date.now() + 2 * HOUR),
    });
    await createMessage(input, actor);
    await flush();
    expect(dispatchDueMessages).not.toHaveBeenCalled();
  });

  it("refus : public vide, ministère d'une autre église, instance avec départements", async () => {
    const base = { title: "T", body: "B", endsAt: new Date(Date.now() + HOUR) };
    resolveRecipients.mockResolvedValue([]);
    await expect(
      createMessage(createSchema.parse({ ...base, scope: "church", churchId: "C1", audience: ALL }), actor)
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Aucun compte/) });

    resolveRecipients.mockResolvedValue(["a"]);
    await expect(
      createMessage(
        createSchema.parse({ ...base, scope: "church", churchId: "C1", audience: { ...ALL, ministryIds: ["M9"] } }),
        actor
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      createMessage(createSchema.parse({ ...base, scope: "instance", audience: { ...ALL, departmentIds: ["D1"] } }), actor)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.systemMessage.create).not.toHaveBeenCalled();
  });

  it("message en cours : public, sévérité et début verrouillés ; texte et fin modifiables", async () => {
    prismaMock.systemMessage.findUnique.mockResolvedValue(row());
    await expect(updateMessage("m1", updateSchema.parse({ severity: "URGENT" }), actor)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(updateMessage("m1", updateSchema.parse({ audience: ALL }), actor)).rejects.toMatchObject({
      statusCode: 400,
    });
    const view = await updateMessage("m1", updateSchema.parse({ title: "Corrigé", endsAt: new Date(Date.now() + 2 * HOUR) }), actor);
    expect(view.title).toBe("Corrigé");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", details: { changedFields: ["title", "endsAt"] } })
    );
    await flush();
    expect(dispatchDueMessages).not.toHaveBeenCalled();
  });

  it("message programmé : tout se modifie", async () => {
    prismaMock.systemMessage.findUnique.mockResolvedValue(
      row({ startsAt: new Date(Date.now() + HOUR), endsAt: new Date(Date.now() + 2 * HOUR), notifiedAt: null })
    );
    await expect(updateMessage("m1", updateSchema.parse({ severity: "URGENT", audience: ALL }), actor)).resolves.toBeTruthy();
  });

  it("message passé ou retiré : ni modification ni retrait", async () => {
    prismaMock.systemMessage.findUnique.mockResolvedValue(row({ withdrawnAt: new Date() }));
    await expect(updateMessage("m1", updateSchema.parse({ title: "X" }), actor)).rejects.toMatchObject({ statusCode: 400 });
    await expect(withdrawMessage("m1", actor)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("retrait : journalisé", async () => {
    prismaMock.systemMessage.findUnique.mockResolvedValue(row());
    await withdrawMessage("m1", actor);
    expect(prismaMock.systemMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ withdrawnAt: expect.any(Date) }) })
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ details: { withdrawn: true } }));
  });

  it("état d'un message", () => {
    const now = new Date();
    expect(messageStatus({ startsAt: new Date(+now + HOUR), endsAt: new Date(+now + 2 * HOUR), withdrawnAt: null }, now)).toBe("scheduled");
    expect(messageStatus({ startsAt: new Date(+now - HOUR), endsAt: new Date(+now + HOUR), withdrawnAt: null }, now)).toBe("active");
    expect(messageStatus({ startsAt: new Date(+now - 2 * HOUR), endsAt: new Date(+now - HOUR), withdrawnAt: null }, now)).toBe("past");
    expect(messageStatus({ startsAt: new Date(+now - HOUR), endsAt: new Date(+now + HOUR), withdrawnAt: now }, now)).toBe("past");
  });
});
