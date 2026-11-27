/**
 * Bloc « À traiter » de l'Accueil (spec 092, lot 2) : une file n'apparaît qu'avec son droit (jamais
 * de « 0 » pour une file inaccessible), une file accessible et vide affiche 0, une file en erreur
 * disparaît seule, et les liens suivent la règle un / plusieurs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";
import { createSession } from "@/__mocks__/auth";

let granted = new Set<string>();
vi.mock("@/lib/auth", () => ({
  hasChurchPermission: async (_s: unknown, permission: string) => granted.has(permission),
}));
let rolePerms: Record<string, string[]> = {};
vi.mock("@/lib/registry", () => ({
  registry: { has: () => true },
  get rolePermissions() {
    return rolePerms;
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const m = {
  resolveRequestQueueAccess: vi.fn(),
  countRequestQueueTodo: vi.fn(),
  listPendingWithdrawals: vi.fn(),
  accountingQueueCounts: vi.fn(),
  getCareAccess: vi.fn(),
  careQueueCounts: vi.fn(),
  countPendingDeclarations: vi.fn(),
  countSubmittedContributions: vi.fn(),
  servingActorFromSession: vi.fn(),
  countServingQueue: vi.fn(),
};
vi.mock("@/modules/planning", () => ({
  resolveRequestQueueAccess: m.resolveRequestQueueAccess,
  countRequestQueueTodo: m.countRequestQueueTodo,
  listPendingWithdrawals: m.listPendingWithdrawals,
}));
vi.mock("@/modules/accounting", () => ({ accountingQueueCounts: m.accountingQueueCounts }));
vi.mock("@/modules/care", () => ({ getCareAccess: m.getCareAccess, careQueueCounts: m.careQueueCounts }));
vi.mock("@/modules/ticketing", () => ({ countPendingDeclarations: m.countPendingDeclarations }));
vi.mock("@/modules/campaigns", () => ({ countSubmittedContributions: m.countSubmittedContributions }));
vi.mock("@/modules/serving/auth", () => ({ servingActorFromSession: m.servingActorFromSession }));
vi.mock("@/modules/serving", () => ({ countServingQueue: m.countServingQueue }));

const { default: TodoBlock, loadTodoQueues } = await import("../TodoBlock");

function session(role: Role): Session {
  return createSession({
    churchRoles: [
      { id: "r", churchId: "ch1", role, ministryId: null, church: { id: "ch1", name: "ICC", slug: "icc" }, departments: [] },
    ] as Session["user"]["churchRoles"],
  });
}

/** Aucun droit nulle part : chaque fonction de compte répond « pas de file ». */
function noAccess() {
  granted = new Set();
  rolePerms = {};
  m.resolveRequestQueueAccess.mockResolvedValue({ configured: true, allowed: false, canManage: false });
  m.listPendingWithdrawals.mockResolvedValue(null);
  m.getCareAccess.mockResolvedValue({ canQualify: false });
  m.careQueueCounts.mockResolvedValue(null);
  m.countPendingDeclarations.mockResolvedValue(null);
  m.countSubmittedContributions.mockResolvedValue(null);
  m.servingActorFromSession.mockResolvedValue({ canManage: false });
  m.countServingQueue.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  noAccess();
});

describe("loadTodoQueues", () => {
  it("aucun droit : aucune file, pas même à zéro, et le bloc ne s'affiche pas", async () => {
    expect(await loadTodoQueues(session("STAR"), "ch1")).toEqual([]);
    expect(m.countRequestQueueTodo).not.toHaveBeenCalled();
    expect(m.accountingQueueCounts).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(await TodoBlock({ session: session("STAR"), churchId: "ch1" }))).toBe("");
  });

  it("Secrétariat : planning:view et équipe configurée et autorisée ; une file vide affiche 0", async () => {
    granted = new Set(["planning:view"]);
    m.resolveRequestQueueAccess.mockResolvedValue({ configured: true, allowed: true, canManage: false });
    m.countRequestQueueTodo.mockResolvedValue(0);
    expect(await loadTodoQueues(session("SECRETARY"), "ch1")).toEqual([
      { key: "secretariat", label: "Demandes du secrétariat", count: 0, href: "/secretariat/requests" },
    ]);
  });

  it("Secrétariat non configuré : pas de file (comme l'écran)", async () => {
    granted = new Set(["planning:view"]);
    m.resolveRequestQueueAccess.mockResolvedValue({ configured: false, allowed: true, canManage: true });
    expect(await loadTodoQueues(session("ADMIN"), "ch1")).toEqual([]);
  });

  it("comptabilité : accounting:manage des rôles de l'église, trois files", async () => {
    rolePerms = { ACCOUNTANT: ["accounting:manage"] };
    m.accountingQueueCounts.mockResolvedValue({ submitted: 2, processing: 1, toPay: 4, toJustify: 3 });
    const queues = await loadTodoQueues(session("ACCOUNTANT"), "ch1");
    expect(queues.map((q) => [q.key, q.count, q.href])).toEqual([
      ["accounting-validate", 3, "/accounting/requests"],
      ["accounting-pay", 4, "/accounting/requests"],
      ["accounting-justify", 3, "/accounting/requests?filtre=justifier"],
    ]);
  });

  it("billetterie et collectes : un élément ⇒ son écran, plusieurs ⇒ la liste filtrée", async () => {
    m.countPendingDeclarations.mockResolvedValue({ count: 2, perEvent: [{ eventId: "ev-1", count: 2 }] });
    m.countSubmittedContributions.mockResolvedValue({
      count: 3,
      perCampaign: [
        { campaignId: "c1", count: 1 },
        { campaignId: "c2", count: 2 },
      ],
    });
    const byKey = Object.fromEntries((await loadTodoQueues(session("ADMIN"), "ch1")).map((q) => [q.key, q.href]));
    expect(byKey.ticketing).toBe("/billetterie/ev-1?vue=reglements");
    expect(byKey.campaigns).toBe("/collectes?a-valider=1");

    m.countPendingDeclarations.mockResolvedValue({ count: 3, perEvent: [{ eventId: "ev-1", count: 1 }, { eventId: "ev-2", count: 2 }] });
    m.countSubmittedContributions.mockResolvedValue({ count: 1, perCampaign: [{ campaignId: "c1", count: 1 }] });
    const again = Object.fromEntries((await loadTodoQueues(session("ADMIN"), "ch1")).map((q) => [q.key, q.href]));
    expect(again.ticketing).toBe("/billetterie?a-traiter=reglements");
    expect(again.campaigns).toBe("/collectes/c1?onglet=suivi&etat=soumis");
  });

  it("remplacements : le lien principal ouvre le plus proche, sans donnée nominative", async () => {
    const date = new Date("2026-03-08T10:00:00Z");
    m.listPendingWithdrawals.mockResolvedValue({ count: 6, items: [{ id: "w1", date, eventTitle: "Culte", departmentName: "Son" }] });
    const [q] = await loadTodoQueues(session("DEPARTMENT_HEAD"), "ch1");
    expect(q).toMatchObject({ key: "replacements", count: 6, href: "/planning/remplacements/w1" });
    expect(q.items?.[0]).toMatchObject({ id: "w1", label: "Culte", href: "/planning/remplacements/w1" });
  });

  it("suivi pastoral et candidatures : l'accès vient du module, l'onglet suit la vue", async () => {
    m.getCareAccess.mockResolvedValue({ canQualify: true });
    m.careQueueCounts.mockResolvedValue({ requests: 1, followUps: 2 });
    m.countServingQueue.mockResolvedValue({ view: "department", count: 1 });
    const byKey = Object.fromEntries((await loadTodoQueues(session("ADMIN"), "ch1")).map((q) => [q.key, q]));
    expect(byKey.care).toMatchObject({ count: 3, href: "/care" });
    expect(byKey.serving).toMatchObject({ count: 1, href: "/candidatures?onglet=departments" });
  });

  it("une file en erreur disparaît seule, les autres restent", async () => {
    m.countPendingDeclarations.mockRejectedValue(new Error("db"));
    m.countSubmittedContributions.mockResolvedValue({ count: 0, perCampaign: [] });
    expect((await loadTodoQueues(session("ADMIN"), "ch1")).map((q) => [q.key, q.count])).toEqual([["campaigns", 0]]);
  });

  it("le rendu ne montre que des nombres et des libellés de file", async () => {
    m.countSubmittedContributions.mockResolvedValue({ count: 2, perCampaign: [{ campaignId: "c1", count: 2 }] });
    const html = renderToStaticMarkup(await TodoBlock({ session: session("ADMIN"), churchId: "ch1" }));
    expect(html).toContain("À traiter");
    expect(html).toContain("Questionnaires à valider");
    expect(html).toContain(">2<");
  });
});
