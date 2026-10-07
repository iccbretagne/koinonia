/**
 * Tests — spec 025 (H-03) : autorisation objet des pièces justificatives comptables.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession, createAdminSession } from "@/__mocks__/auth";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
// canReadAttachment importe dynamiquement @/lib/registry, qui charge la chaîne de boot des
// modules jusqu'à @/lib/auth (NextAuth(...)) — sans ce mock, l'import réel de "next-auth"
// échoue hors contexte Next.js (cf. src/lib/__tests__/auth-multitenant.test.ts).
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const { assertAttachmentsAssignable, canReadAttachment } = await import("../attachments");

describe("assertAttachmentsAssignable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepte quand toutes les pièces sont du déposant, orphelines et de son église", async () => {
    prismaMock.financialAttachment.count.mockResolvedValue(2);

    await expect(
      assertAttachmentsAssignable(["att-1", "att-2"], { userId: "user-1", churchId: "church-1" })
    ).resolves.toBeUndefined();

    expect(prismaMock.financialAttachment.count).toHaveBeenCalledWith({
      where: {
        id: { in: ["att-1", "att-2"] },
        uploadedById: "user-1",
        requestId: null,
        churchId: "church-1",
      },
    });
  });

  it.each([
    // Pour une pièce déjà rattachée, requestId n'est plus null → hors du filtre → count divergent.
    ["une pièce déposée par quelqu'un d'autre", "att-of-someone-else"],
    ["une pièce déjà rattachée à une autre demande", "att-already-linked"],
    ["une pièce d'une autre église", "att-other-church"],
    ["un identifiant inexistant", "nonexistent"],
  ])("rejette %s", async (_label, attachmentId) => {
    prismaMock.financialAttachment.count.mockResolvedValue(0);

    await expect(
      assertAttachmentsAssignable([attachmentId], { userId: "user-1", churchId: "church-1" })
    ).rejects.toThrow();
  });

  it("un lot mixte (une valide, une invalide) est rejeté dans son ensemble", async () => {
    // 2 ids demandés, un seul remplit les conditions → count=1 ≠ 2 → rejet global.
    prismaMock.financialAttachment.count.mockResolvedValue(1);

    await expect(
      assertAttachmentsAssignable(["att-valid", "att-invalid"], {
        userId: "user-1",
        churchId: "church-1",
      })
    ).rejects.toThrow();
  });

  it("dédoublonne les identifiants avant de comparer la cardinalité", async () => {
    prismaMock.financialAttachment.count.mockResolvedValue(1);

    await expect(
      assertAttachmentsAssignable(["att-1", "att-1"], { userId: "user-1", churchId: "church-1" })
    ).resolves.toBeUndefined();
  });

  it("ne fait aucune requête pour une liste vide", async () => {
    await assertAttachmentsAssignable([], { userId: "user-1", churchId: "church-1" });
    expect(prismaMock.financialAttachment.count).not.toHaveBeenCalled();
  });

  it("accepte un client de transaction explicite plutôt que le singleton global", async () => {
    const txCount = vi.fn().mockResolvedValue(1);
    const tx = { financialAttachment: { count: txCount } };

    await assertAttachmentsAssignable(
      ["att-1"],
      { userId: "user-1", churchId: "church-1" },
      tx as never
    );

    expect(txCount).toHaveBeenCalled();
    expect(prismaMock.financialAttachment.count).not.toHaveBeenCalled();
  });
});

describe("canReadAttachment", () => {
  it("autorise le déposant à lire sa propre pièce", async () => {
    const session = createSession({ id: "user-1" });
    const result = await canReadAttachment(
      { uploadedById: "user-1", churchId: "church-1" },
      session
    );
    expect(result).toBe(true);
  });

  it("autorise le Super Admin sans condition d'église", async () => {
    const session = createSession({ id: "user-2", isSuperAdmin: true });
    const result = await canReadAttachment(
      { uploadedById: "someone-else", churchId: "church-1" },
      session
    );
    expect(result).toBe(true);
  });

  it("autorise accounting:manage dans l'église de la pièce", async () => {
    const session = createAdminSession("church-1"); // ADMIN → accounting:manage
    const result = await canReadAttachment(
      { uploadedById: "someone-else", churchId: "church-1" },
      session
    );
    expect(result).toBe(true);
  });

  it("refuse accounting:submit seul (MINISTER) pour la pièce d'un tiers", async () => {
    const session = createSession({
      id: "user-3",
      churchRoles: [
        {
          id: "role-1",
          churchId: "church-1",
          role: "MINISTER",
          ministryId: null,
          church: { id: "church-1", name: "Test Church", slug: "test-church" },
          departments: [],
        },
      ],
    });
    const result = await canReadAttachment(
      { uploadedById: "someone-else", churchId: "church-1" },
      session
    );
    expect(result).toBe(false);
  });

  it("refuse accounting:manage détenu dans une AUTRE église que celle de la pièce", async () => {
    const session = createAdminSession("church-A"); // ADMIN dans A seulement
    const result = await canReadAttachment(
      { uploadedById: "someone-else", churchId: "church-B" },
      session
    );
    expect(result).toBe(false);
  });
});
