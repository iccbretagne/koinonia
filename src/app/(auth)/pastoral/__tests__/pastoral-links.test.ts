/**
 * Spec 092, T0.6 — les pages pastorales ne proposent jamais de lien vers un écran qui refuserait
 * la personne : une ligne n'est cliquable que si le droit sur la cible est détenu.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSession } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";

const C = "church-1";
let session = createSession({ churchRoles: [] });
const mockScope = vi.fn();

vi.mock("../active-church", () => ({
  requirePastoralActiveChurch: async () => ({ session, activeChurchId: C }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/accounting", () => ({
  getAccountingDepartmentScope: (...a: unknown[]) => mockScope(...a),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const ReportsPage = (await import("../reports/page")).default;
const AccountingPage = (await import("../accounting/page")).default;

function role(role: string) {
  return { id: `r-${role}`, churchId: C, role, ministryId: null, church: { id: C, name: "Église", slug: "eglise" }, departments: [] };
}

const past = new Date(Date.now() - 86_400_000);

function mockEvents() {
  prismaMock.event.findMany.mockResolvedValue([
    { id: "ev-done", title: "Culte A", type: "CULTE", date: past, reportEnabled: true, report: { id: "rp", speaker: null, messageTitle: null, updatedAt: past, sections: [] } },
    { id: "ev-todo", title: "Culte B", type: "CULTE", date: past, reportEnabled: true, report: null },
  ] as never);
  prismaMock.church.findUnique.mockResolvedValue({ name: "Église" } as never);
}

function mockRequests() {
  const req = (id: string, departmentId: string | null, submittedById: string) => ({
    id, type: "EXPENSE", label: `Demande ${id}`, amount: 10, status: "SUBMITTED", createdAt: past,
    departmentId, submittedById, department: departmentId ? { name: "Son" } : null, submittedBy: { name: "X" },
  });
  prismaMock.financialRequest.findMany.mockResolvedValue([
    req("in-scope", "d1", "someone"),
    req("out-scope", "d2", "someone"),
    req("own", null, session.user.id),
  ] as never);
  prismaMock.financialPayment.findMany.mockResolvedValue([
    { id: "pay-1", amount: 5, request: { id: "out-scope", label: "Demande out-scope", departmentId: "d2", submittedById: "someone" } },
  ] as never);
  prismaMock.church.findUnique.mockResolvedValue({ name: "Église" } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/pastoral/reports — liens vers le compte rendu", () => {
  it("pasteur sans rôle : aucun lien vers /admin/events/…/report", async () => {
    session = createSession({ churchRoles: [], pastoralChurchIds: [C] } as never);
    mockEvents();
    const html = renderToStaticMarkup(await ReportsPage());
    expect(html).toContain("Culte A");
    expect(html).not.toContain("/report");
    expect(html).not.toContain("Rédiger le CR");
  });

  it("pasteur Reporter (reports:view) : les lignes et le bouton sont des liens", async () => {
    session = createSession({ churchRoles: [role("REPORTER")], pastoralChurchIds: [C] } as never);
    mockEvents();
    const html = renderToStaticMarkup(await ReportsPage());
    expect(html).toContain('href="/admin/events/ev-done/report"');
    expect(html).toContain('href="/admin/events/ev-todo/report"');
  });
});

describe("/pastoral/accounting — liens vers le détail d'une demande", () => {
  it("pasteur sans rôle (périmètre vide) : seule sa propre demande est un lien", async () => {
    session = createSession({ churchRoles: [], pastoralChurchIds: [C] } as never);
    mockScope.mockResolvedValue([]);
    mockRequests();
    const html = renderToStaticMarkup(await AccountingPage());
    expect(html).toContain('href="/accounting/requests/own"');
    expect(html).not.toContain('href="/accounting/requests/in-scope"');
    expect(html).not.toContain('href="/accounting/requests/out-scope"');
    expect(html).toContain("Demande out-scope");
  });

  it("périmètre de départements : seules les demandes du périmètre sont des liens", async () => {
    session = createSession({ churchRoles: [role("DEPARTMENT_HEAD")], pastoralChurchIds: [C] } as never);
    mockScope.mockResolvedValue(["d1"]);
    mockRequests();
    const html = renderToStaticMarkup(await AccountingPage());
    expect(html).toContain('href="/accounting/requests/in-scope"');
    expect(html).not.toContain('href="/accounting/requests/out-scope"');
  });

  it("gestionnaire (périmètre complet) : toutes les lignes sont des liens", async () => {
    session = createSession({ churchRoles: [role("ACCOUNTANT")], pastoralChurchIds: [C] } as never);
    mockScope.mockResolvedValue(null);
    mockRequests();
    const html = renderToStaticMarkup(await AccountingPage());
    expect(html).toContain('href="/accounting/requests/in-scope"');
    expect(html).toContain('href="/accounting/requests/out-scope"');
  });
});
