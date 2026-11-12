/**
 * Tests — compte rendu complet par l'assistant IA (spec 081, lot 3) : mêmes droits et mêmes
 * statistiques que l'écran de saisie, sections d'office, sections libres, renommage, suppression,
 * statistiques fusionnées clé par clé, compte rendu modifié ⇒ refus.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { viewerFor } from "../../assistant/__tests__/viewers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const perms = new Set<string>();
vi.mock("@/lib/auth", () => ({ hasChurchPermission: vi.fn(async (_s: unknown, p: string) => perms.has(p)) }));
const mcp = { createConfirmation: vi.fn(async (..._a: unknown[]) => ({ token: "kmx_tok", expiresAt: new Date("2099-01-01T00:05:00Z") })), consumeConfirmation: vi.fn(), publicOrigin: () => "https://koinonia.test" };
vi.mock("@/modules/mcp", () => mcp);
const saveReport = vi.fn();
vi.mock("@/app/api/events/[eventId]/report/_core", () => ({ saveReport: (...a: unknown[]) => saveReport(...a) }));

const r = await import("../_actions/report");
const { CHANGED } = await import("../_actions/common");

const ctx = { session: { user: { id: "u1", churchRoles: [] } } as never, churchId: "c1", viewer: viewerFor("SECRETARY"), grantId: "g1" };
const EVENT = { id: "e1", churchId: "c1", title: "Culte ", date: new Date("2099-03-14T09:00:00Z"), reportEnabled: true, statsEnabled: true };
const EXISTING = {
  speaker: null,
  messageTitle: null,
  notes: "Belle louange",
  decisions: null,
  updatedAt: new Date("2099-03-14T12:00:00Z"),
  sections: [
    { departmentId: "dA", label: "Accueil", position: 0, stats: { hommes: 10, femmes: 12, enfants: 3 }, notes: null },
    { departmentId: null, label: "Prière", position: 1, stats: null, notes: "Intercession" },
  ],
};
type Payload = { data: { notes: string | null; sections: { label: string; departmentId: string | null; position: number; stats: Record<string, number | null> | null; notes: string | null }[] } };
const lastPayload = () => (mcp.createConfirmation.mock.calls.at(-1) as unknown[])[2] as Payload;

beforeEach(() => {
  vi.clearAllMocks();
  perms.clear();
  perms.add("reports:edit");
  prismaMock.event.findUnique.mockResolvedValue(EVENT);
  prismaMock.eventReport.findUnique.mockResolvedValue(EXISTING);
  prismaMock.department.findMany.mockResolvedValue([
    { id: "dA", name: "Accueil" },
    { id: "dS", name: "Sainte-Cène" },
    { id: "dI", name: "Intégration" },
    { id: "dL", name: "Louange" },
  ]);
  prismaMock.eventDepartment.findMany.mockResolvedValue([
    { department: { id: "dA", name: "Accueil" } },
    { department: { id: "dL", name: "Louange" } },
  ]);
});

describe("outils proposés", () => {
  it("reports:edit ou events:manage (Reporter, Secrétaire), pas le Resp. département", () => {
    const names = (role: string) => r.REPORT_ACTIONS.filter((a) => a.available(viewerFor(role))).map((a) => a.name);
    expect(names("REPORTER")).toEqual(["report_form", "fill_report_preview", "fill_report_confirm"]);
    expect(names("SECRETARY")).toContain("fill_report_confirm");
    expect(names("DEPARTMENT_HEAD")).toEqual([]);
  });
});

describe("report_form", () => {
  it("sections existantes avec leurs statistiques attendues et valeurs", async () => {
    const out = await r.reportForm({ eventId: "e1" }, ctx);
    expect(out.text).toContain("- Accueil : hommes (Hommes) = 10, femmes (Femmes) = 12, enfants (Enfants) = 3");
    expect(out.text).toContain("- Prière (section libre) : observations seulement · observations « Intercession »");
    expect(out.structured).toMatchObject({ exists: true, statsEnabled: true });
  });

  it("nouveau compte rendu : une section par département de l'événement, comme l'écran", async () => {
    prismaMock.eventReport.findUnique.mockResolvedValue(null);
    const out = await r.reportForm({ eventId: "e1" }, ctx);
    expect(out.text).toContain("pas encore saisi");
    expect((out.structured.sections as { label: string }[]).map((s) => s.label)).toEqual(["Accueil", "Louange"]);
  });

  it("statistiques désactivées : observations seulement", async () => {
    prismaMock.event.findUnique.mockResolvedValue({ ...EVENT, statsEnabled: false });
    const out = await r.reportForm({ eventId: "e1" }, ctx);
    expect(out.text).toContain("- Accueil : observations seulement");
    expect(out.text).toContain("Statistiques non activées");
  });
});

describe("fill_report_preview", () => {
  it("statistiques fusionnées clé par clé, totaux calculés, autres rubriques gardées", async () => {
    const out = await r.previewReport({ eventId: "e1", speaker: "Pasteur A", sections: [{ label: "accueil", stats: { hommes: 40, femmes: 50 } }] }, ctx);
    expect(out.text).toContain("- Orateur : « Pasteur A » (avant : vide)");
    expect(out.text).toContain(
      "- Accueil : Hommes 40, Femmes 50, Enfants 3, total adultes 90, total général 93 (avant : Hommes 10, Femmes 12, Enfants 3, total adultes 22, total général 25)"
    );
    const { data } = lastPayload();
    expect(data.notes).toBe("Belle louange");
    expect(data.sections[0].stats).toEqual({ hommes: 40, femmes: 50, enfants: 3 });
    expect(data.sections[1]).toMatchObject({ label: "Prière", notes: "Intercession" });
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("ajout d'un département et d'une section libre, renommage, suppression", async () => {
    const out = await r.previewReport(
      {
        eventId: "e1",
        sections: [
          { label: "Sainte-Cène", stats: { supportsUtilises: 80, supportsRestants: 20 } },
          { label: "Offrandes", free: true, notes: "Projet bâtiment" },
          { label: "Prière", rename: "Temps de prière" },
          { label: "Accueil", remove: true },
        ],
      },
      ctx
    );
    expect(out.text).toContain("- Sainte-Cène (nouvelle section) : Supports utilisés 80, Supports restants 20");
    expect(out.text).toContain("- Offrandes (nouvelle section libre) : sans chiffres · « Projet bâtiment »");
    expect(out.text).toContain("- Prière → Temps de prière : sans chiffres · « Intercession »");
    expect(out.text).toContain("- Accueil : section supprimée");
    expect(lastPayload().data.sections.map((s) => [s.label, s.departmentId, s.position])).toEqual([
      ["Temps de prière", null, 0],
      ["Sainte-Cène", "dS", 1],
      ["Offrandes", null, 2],
    ]);
  });

  it("nouveau compte rendu : sections d'office gardées avec celles fournies", async () => {
    prismaMock.eventReport.findUnique.mockResolvedValue(null);
    const out = await r.previewReport({ eventId: "e1", sections: [{ label: "Intégration", stats: { hommes: 2, convertis: 1 } }] }, ctx);
    expect(out.text).toContain("- Intégration (nouvelle section) : Nouveaux arrivants (H) 2, Nouveaux convertis 1");
    expect(out.text).toContain("Sections enregistrées : Accueil, Louange, Intégration.");
  });

  it("refus : statistique inconnue, section sans statistiques, statistiques désactivées, section inconnue, doublon de libellé", async () => {
    const ask = (sections: Parameters<typeof r.previewReport>[0]["sections"]) => r.previewReport({ eventId: "e1", sections }, ctx).then((o) => o.text);
    expect(await ask([{ label: "Accueil", stats: { adultes: 4 } }])).toContain("Statistique inconnue pour « Accueil » : adultes (attendues : hommes = Hommes");
    expect(await ask([{ label: "Louange", stats: { musiciens: 6 } }])).toContain("n'a pas de statistiques");
    expect(await ask([{ label: "Fanfare", notes: "x" }])).toContain("free: true");
    expect(await ask([{ label: "Accueil", rename: "Prière" }])).toContain("s'appelle déjà");
    expect(await ask([{ label: "Inexistante", remove: true }])).toContain("Section introuvable");
    prismaMock.event.findUnique.mockResolvedValue({ ...EVENT, statsEnabled: false });
    expect(await ask([{ label: "Accueil", stats: { hommes: 4 } }])).toContain("ne sont pas activées");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });

  it("refus : sans droit, comptes rendus désactivés, plusieurs événements le même jour", async () => {
    perms.clear();
    expect((await r.previewReport({ eventId: "e1", speaker: "X" }, ctx)).text).toContain("ne pouvez pas");
    perms.add("events:manage");
    prismaMock.event.findUnique.mockResolvedValueOnce({ ...EVENT, reportEnabled: false });
    expect((await r.previewReport({ eventId: "e1", speaker: "X" }, ctx)).text).toContain("pas activés");
    prismaMock.event.findMany.mockResolvedValue([EVENT, { ...EVENT, id: "e2", title: "Baptêmes" }]);
    expect((await r.previewReport({ day: "2099-03-14", speaker: "X" }, ctx)).text).toContain("[eventId e2]");
    expect(mcp.createConfirmation).not.toHaveBeenCalled();
  });
});

describe("fill_report_confirm", () => {
  it("compte rendu modifié entre-temps ⇒ refus ; sinon code de l'écran via mcp", async () => {
    await r.previewReport({ eventId: "e1", speaker: "Pasteur A" }, ctx);
    mcp.consumeConfirmation.mockResolvedValue(lastPayload());
    prismaMock.eventReport.findUnique.mockResolvedValueOnce({ ...EXISTING, notes: "Modifié par la Secrétaire" });
    expect((await r.confirmReport({ confirmation: "kmx_tok" }, ctx)).text).toBe(CHANGED);
    expect(saveReport).not.toHaveBeenCalled();
    await r.confirmReport({ confirmation: "kmx_tok" }, ctx);
    expect(saveReport).toHaveBeenCalledWith(ctx.session, EVENT, expect.objectContaining({ speaker: "Pasteur A", notes: "Belle louange" }), { via: "mcp" });
  });
});
