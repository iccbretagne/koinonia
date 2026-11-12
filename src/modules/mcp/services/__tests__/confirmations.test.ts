/**
 * Tests — jetons de confirmation des actions d'un assistant IA (spec 081, lot 2).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { createConfirmation, consumeConfirmation, canWrite, CONFIRMATION_TTL_MS } = await import("../confirmations");
const { hashToken } = await import("../tokens");

const now = new Date("2026-11-12T10:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("jeton de confirmation", () => {
  it("aperçu : empreinte seule stockée, 5 minutes, liée à la connexion et à l'action", async () => {
    const { token, expiresAt } = await createConfirmation("g1", "declare_unavailability", { memberId: "m1" }, now);
    expect(token).toMatch(/^kmx_/);
    expect(expiresAt.getTime() - now.getTime()).toBe(CONFIRMATION_TTL_MS);
    const data = prismaMock.mcpConfirmation.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ grantId: "g1", action: "declare_unavailability", hash: hashToken(token), payload: { memberId: "m1" } });
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it("confirmation : prise atomique conditionnée à la connexion, l'action, l'expiration et un seul usage", async () => {
    prismaMock.mcpConfirmation.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.mcpConfirmation.findUnique.mockResolvedValue({ payload: { memberId: "m1" } });
    expect(await consumeConfirmation("g1", "answer_service", "kmx_abc", now)).toEqual({ memberId: "m1" });
    expect(prismaMock.mcpConfirmation.updateMany).toHaveBeenCalledWith({
      where: { hash: hashToken("kmx_abc"), grantId: "g1", action: "answer_service", usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
  });

  it("rejouée, expirée, d'une autre connexion ou d'une autre action : refus sans rien renvoyer", async () => {
    prismaMock.mcpConfirmation.updateMany.mockResolvedValue({ count: 0 });
    expect(await consumeConfirmation("g1", "answer_service", "kmx_abc", now)).toBeNull();
    expect(prismaMock.mcpConfirmation.findUnique).not.toHaveBeenCalled();
    expect(await consumeConfirmation("g1", "answer_service", "kma_access", now)).toBeNull();
  });

  it("portée : actions seulement avec « write »", () => {
    expect(canWrite("read")).toBe(false);
    expect(canWrite("read write")).toBe(true);
  });
});
