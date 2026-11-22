import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const createNotification = vi.fn();
vi.mock("@/lib/notifications", () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const { grantFormsAccess, revokeFormsAccess, searchChurchUsersForFormsGrant, addFormManager, removeFormManager } = await import("../grants");

/** Accès délégué et partage (spec 085). */
beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "r1" });
});

describe("accès délégué", () => {
  it("octroi : créé, journalisé, notifié ; déjà accordé : rien", async () => {
    prismaMock.formsGrant.findUnique.mockResolvedValueOnce(null);
    prismaMock.formsGrant.create.mockResolvedValue({ id: "g1" });
    expect(await grantFormsAccess("c1", "admin", "u2")).toEqual({ created: true });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "FormsGrant", action: "CREATE" }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2", domain: "forms", type: "FORMS_ACCESS_GRANTED" }));

    vi.clearAllMocks();
    prismaMock.userChurchRole.findFirst.mockResolvedValue({ id: "r1" });
    prismaMock.formsGrant.findUnique.mockResolvedValueOnce({ id: "g1" });
    expect(await grantFormsAccess("c1", "admin", "u2")).toEqual({ created: false });
    expect(prismaMock.formsGrant.create).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("octroi à un compte hors de l'église : 400", async () => {
    prismaMock.userChurchRole.findFirst.mockResolvedValue(null);
    await expect(grantFormsAccess("c1", "admin", "u2")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("retrait : supprimé, journalisé, notifié ; inconnu : 404", async () => {
    prismaMock.formsGrant.findUnique.mockResolvedValueOnce({ id: "g1" });
    await revokeFormsAccess("c1", "admin", "u2");
    expect(prismaMock.formsGrant.delete).toHaveBeenCalledWith({ where: { id: "g1" } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "FormsGrant" }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "FORMS_ACCESS_REVOKED" }));
    prismaMock.formsGrant.findUnique.mockResolvedValueOnce(null);
    await expect(revokeFormsAccess("c1", "admin", "u3")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("recherche bornée aux comptes de l'église", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "u2", name: "Marie", displayName: null, email: "m@x.fr" }]);
    expect(await searchChurchUsersForFormsGrant("c1", "mar")).toEqual([{ id: "u2", name: "Marie", email: "m@x.fr" }]);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ churchRoles: { some: { churchId: "c1" } } }) }));
  });
});

describe("partage", () => {
  beforeEach(() => {
    prismaMock.form.findFirst.mockResolvedValue({ title: "PCNC", createdById: "u1" });
  });

  it("partage avec un compte délégué : créé, journalisé, notifié ; idempotent", async () => {
    prismaMock.formsGrant.findUnique.mockResolvedValue({ id: "g2" });
    prismaMock.formManager.findUnique.mockResolvedValueOnce(null);
    expect(await addFormManager("f1", "c1", "u1", "u2")).toEqual({ created: true });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "FormManager", action: "CREATE" }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2", type: "FORM_SHARED" }));
    prismaMock.formManager.findUnique.mockResolvedValueOnce({ userId: "u2" });
    expect(await addFormManager("f1", "c1", "u1", "u2")).toEqual({ created: false });
    expect(prismaMock.formManager.create).toHaveBeenCalledTimes(1);
  });

  it("partage refusé vers un compte sans accès, ou vers l'auteur", async () => {
    prismaMock.formsGrant.findUnique.mockResolvedValue(null);
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ role: "STAR" }]);
    await expect(addFormManager("f1", "c1", "u1", "u2")).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.formManager.create).not.toHaveBeenCalled();
    await expect(addFormManager("f1", "c1", "u1", "u1")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("partage avec un compte forms:manage sans accès délégué : accepté", async () => {
    prismaMock.formsGrant.findUnique.mockResolvedValue(null);
    prismaMock.userChurchRole.findMany.mockResolvedValue([{ role: "SECRETARY" }]);
    prismaMock.formManager.findUnique.mockResolvedValue(null);
    expect(await addFormManager("f1", "c1", "u1", "u2")).toEqual({ created: true });
  });

  it("retrait : supprimé et notifié ; inconnu : 404", async () => {
    prismaMock.formManager.findUnique.mockResolvedValueOnce({ userId: "u2", form: { title: "PCNC" } });
    await removeFormManager("f1", "c1", "u1", "u2");
    expect(prismaMock.formManager.delete).toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "FORM_UNSHARED" }));
    prismaMock.formManager.findUnique.mockResolvedValueOnce(null);
    await expect(removeFormManager("f1", "c1", "u1", "u3")).rejects.toMatchObject({ statusCode: 404 });
  });
});
