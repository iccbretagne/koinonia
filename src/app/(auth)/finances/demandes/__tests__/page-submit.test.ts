/**
 * Spec 092, T0.6 — « Nouvelle demande » n'est proposé qu'avec `accounting:submit` (exigé par
 * `POST /api/accounting/requests`) : un pasteur sans ce droit ne voit pas le bouton.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSession } from "@/__mocks__/auth";
import { prismaMock } from "@/__mocks__/prisma";

const C = "church-1";
let session = createSession();

vi.mock("@/lib/auth", () => ({
  requireAuth: async () => session,
  getCurrentChurchId: async () => C,
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/modules/shuttle/auth", () => ({ isShuttleVisible: async () => false }));
vi.mock("@/modules/treasury/auth", () => ({ isTreasuryVisible: async () => false }));
vi.mock("@/modules/accounting", () => ({
  accountingQueueCounts: async () => ({ submitted: 0, processing: 0, toPay: 0, toJustify: 0 }),
  getJustificationSettings: async () => null,
  isJustificationClaimable: () => false,
  isRequestArchived: () => false,
}));
vi.mock("../AccountingDashboard", () => ({ default: () => createElement("div", { "data-dashboard": true }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const Page = (await import("../page")).default;

const role = (r: string) => ({ id: `r-${r}`, churchId: C, role: r, ministryId: null, church: { id: C, name: "É", slug: "e" }, departments: [] });

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.financialRequest.findMany.mockResolvedValue([] as never);
  prismaMock.userChurchRole.findMany.mockResolvedValue([] as never);
});

describe("/finances/demandes — bouton « Nouvelle demande »", () => {
  it("pasteur sans rôle : page lisible, sans bouton", async () => {
    session = createSession({ churchRoles: [], pastoralChurchIds: [C] } as never);
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("data-dashboard");
    expect(html).not.toContain("/finances/demandes/nouvelle");
  });

  it("Responsable de département (accounting:submit) : bouton présent", async () => {
    session = createSession({ churchRoles: [role("DEPARTMENT_HEAD")] } as never);
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('href="/finances/demandes/nouvelle"');
  });
});
