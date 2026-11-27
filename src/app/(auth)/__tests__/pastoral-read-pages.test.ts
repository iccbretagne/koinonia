/**
 * Spec 092, lot 3 (T3.6–T3.8, T3.14) — pages ouvertes par les exceptions de droits, gardes réelles
 * de `@/lib/auth` (seuls `auth()` et le cookie d'église sont simulés) :
 * - « Mes demandes » : tout compte de l'église, ses propres demandes seulement, « Nouvelle demande »
 *   seulement avec `members:view` ;
 * - comptes rendus et demande comptable : lecture pastorale de toute l'église, sans action.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession, createStarSession, createAdminSession } from "@/__mocks__/auth";

const mockAuth = vi.fn();
let currentChurch: string | undefined = "church-1";
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (k === "current-church" && currentChurch ? { value: currentChurch } : undefined), set: () => {} }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (u: string) => { throw new Error(`REDIRECT:${u}`); },
  useParams: () => ({}),
  useRouter: () => ({}),
}));
vi.mock("next-auth", () => ({
  default: () => ({ auth: mockAuth, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, auth: () => mockAuth() };
});

const MyRequestsPage = (await import("../requests/page")).default;
const RequestsList = (await import("../requests/RequestsList")).default;
const ReportsPage = (await import("../admin/reports/page")).default;
const ReportsClient = (await import("../admin/reports/ReportsClient")).default;
const EventReportPage = (await import("../admin/events/[eventId]/report/page")).default;
const EventReportClient = (await import("../admin/events/[eventId]/report/EventReportClient")).default;
const EventReportReadOnly = (await import("../admin/events/[eventId]/report/EventReportReadOnly")).default;
const AccountingDetailPage = (await import("../accounting/requests/[id]/page")).default;
const RequestDetail = (await import("../accounting/requests/[id]/RequestDetail")).default;

/** Parcourt l'arbre d'éléments rendu (sans exécuter les composants enfants). */
function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  const out: ReactElement<Record<string, unknown>>[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    const el = n as ReactElement<Record<string, unknown>>;
    if (el.type === type) out.push(el);
    const props = (el.props ?? {}) as Record<string, unknown>;
    for (const v of Object.values(props)) if (v && typeof v === "object") walk(v);
  };
  walk(node);
  return out;
}

function text(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  const props = ((node as ReactElement<Record<string, unknown>>).props ?? {}) as Record<string, unknown>;
  return Object.values(props).map((v) => (v && typeof v === "object" ? text(v as ReactNode) : typeof v === "string" ? v : "")).join(" ");
}

function role(r: string, churchId = "church-1") {
  return { id: `r-${r}`, churchId, role: r, ministryId: null, church: { id: churchId, name: "Église", slug: "eglise" }, departments: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentChurch = "church-1";
  prismaMock.request.findMany.mockResolvedValue([]);
  prismaMock.appointmentRequest.findMany.mockResolvedValue([]);
  prismaMock.department.findMany.mockResolvedValue([]);
});

describe("/requests — « Mes demandes » pour tout compte de l'église", () => {
  const profiles: [string, () => ReturnType<typeof createSession>, boolean][] = [
    ["STAR", () => createStarSession("church-1"), false],
    ["Faiseur de disciples", () => createSession({ churchRoles: [role("DISCIPLE_MAKER")] } as never), false],
    ["Reporter", () => createSession({ churchRoles: [role("REPORTER")] } as never), false],
    ["Comptable", () => createSession({ churchRoles: [role("ACCOUNTANT")] } as never), false],
    ["Référent soins pastoraux", () => createSession({ churchRoles: [role("PASTORAL_CARE_REFERENT")] } as never), false],
    ["Pasteur sans rôle", () => createSession({ churchRoles: [], pastoralChurchIds: ["church-1"] } as never), true],
    ["Admin", () => createAdminSession("church-1"), true],
  ];

  it.each(profiles)("%s : la page s'ouvre, ne lit que ses demandes", async (_name, session, canCreate) => {
    const s = session();
    mockAuth.mockResolvedValue(s);
    const page = await MyRequestsPage();
    // Lecture bornée au compte et à l'église courante.
    expect(prismaMock.request.findMany.mock.calls[0][0]?.where).toMatchObject({ churchId: "church-1", submittedById: s.user.id });
    expect(prismaMock.appointmentRequest.findMany.mock.calls[0][0]?.where).toMatchObject({ churchId: "church-1", userId: s.user.id });
    const [list] = find(page, RequestsList);
    expect(list.props.canCreate).toBe(canCreate);
    expect(text(page).includes("Nouvelle demande")).toBe(canCreate);
    // « Demander un rendez-vous » proposé à tous (exception 2).
    expect(text(page)).toContain("Demander un rendez-vous");
  });

  it("église forcée sans rattachement : ignorée, lecture dans sa propre église", async () => {
    mockAuth.mockResolvedValue(createSession({ churchRoles: [role("ADMIN", "church-2")], pastoralChurchIds: [] } as never));
    currentChurch = "church-1";
    // Le cookie est ignoré (aucun rattachement) : église de repli = church-2, où il a un rôle.
    await MyRequestsPage();
    expect(prismaMock.request.findMany.mock.calls[0][0]?.where).toMatchObject({ churchId: "church-2" });
  });

  it("compte sans aucun rattachement : pas d'église, aucune lecture", async () => {
    mockAuth.mockResolvedValue(createSession({ churchRoles: [], pastoralChurchIds: [] } as never));
    await MyRequestsPage();
    expect(prismaMock.request.findMany).not.toHaveBeenCalled();
  });
});

describe("/admin/reports — lecture pastorale", () => {
  beforeEach(() => prismaMock.event.findMany.mockResolvedValue([]));

  it("pasteur sans rôle : liste en lecture seule (ni saisie ni export)", async () => {
    mockAuth.mockResolvedValue(createSession({ churchRoles: [], pastoralChurchIds: ["church-1"] } as never));
    const [client] = find(await ReportsPage(), ReportsClient);
    expect(client.props.readOnly).toBe(true);
    expect(prismaMock.event.findMany.mock.calls[0][0]?.where).toMatchObject({ churchId: "church-1" });
  });

  it("Reporter : mode normal", async () => {
    mockAuth.mockResolvedValue(createSession({ churchRoles: [role("REPORTER")] } as never));
    const [client] = find(await ReportsPage(), ReportsClient);
    expect(client.props.readOnly).toBe(false);
  });

  it("STAR : refus", async () => {
    mockAuth.mockResolvedValue(createStarSession("church-1"));
    await expect(ReportsPage()).rejects.toThrow();
  });
});

describe("/admin/events/[eventId]/report — lecture pastorale", () => {
  const params = Promise.resolve({ eventId: "ev-1" });
  const event = (churchId = "church-1") => ({
    id: "ev-1", title: "Culte", date: new Date("2026-05-03"), type: "CULTE", churchId, reportEnabled: true, statsEnabled: true,
    report: { id: "rep-1", speaker: "P", messageTitle: "M", notes: "n", decisions: "d", sections: [], author: null },
  });
  beforeEach(() => prismaMock.eventDepartment.findMany.mockResolvedValue([]));

  it("pasteur de l'église de l'événement : vue lecture seule, aucun éditeur", async () => {
    mockAuth.mockResolvedValue(createSession({ churchRoles: [], pastoralChurchIds: ["church-1"] } as never));
    prismaMock.event.findUnique.mockResolvedValue(event() as never);
    const page = await EventReportPage({ params });
    expect(find(page, EventReportReadOnly)).toHaveLength(1);
    expect(find(page, EventReportClient)).toHaveLength(0);
  });

  it("pasteur d'une autre église : refus", async () => {
    mockAuth.mockResolvedValue(createSession({ churchRoles: [], pastoralChurchIds: ["church-1"] } as never));
    prismaMock.event.findUnique.mockResolvedValue(event("church-2") as never);
    await expect(EventReportPage({ params })).rejects.toThrow();
  });

  it("Reporter : éditeur inchangé", async () => {
    mockAuth.mockResolvedValue(createSession({ churchRoles: [role("REPORTER")] } as never));
    prismaMock.event.findUnique.mockResolvedValue(event() as never);
    const page = await EventReportPage({ params });
    expect(find(page, EventReportClient)).toHaveLength(1);
    expect(find(page, EventReportReadOnly)).toHaveLength(0);
  });
});

describe("/accounting/requests/[id] — lecture pastorale", () => {
  const params = Promise.resolve({ id: "req-1" });
  const req = (churchId = "church-1") => ({
    id: "req-1", churchId, submittedById: "someone", departmentId: "dept-x", status: "SUBMITTED", amount: { toString: () => "12" },
    submittedBy: { id: "someone", name: "Jean", email: "jean@example.org" },
    attachments: [{ id: "a1", filename: "f.pdf", mimeType: "application/pdf", size: 1, s3Key: "secret-key" }],
    payments: [], corrections: [], pieceRequestCount: 0, pieceRequestedAt: null, department: null,
    shuttleReimbursedEntry: null, shuttleImportedEntry: null, overageOfJustificationId: null, archivedAt: null,
  });

  it("pasteur sans rôle : détail en lecture, sans email, sans clé de pièce, sans justificatif", async () => {
    mockAuth.mockResolvedValue(createSession({ churchRoles: [], pastoralChurchIds: ["church-1"] } as never));
    prismaMock.financialRequest.findUnique.mockResolvedValue(req() as never);
    prismaMock.userChurchRole.findMany.mockResolvedValue([]);
    prismaMock.userChurchRole.count.mockResolvedValue(1);
    const [detail] = find(await AccountingDetailPage({ params }), RequestDetail);
    expect(detail.props).toMatchObject({ readOnly: true, canManage: false, isOwn: false, justification: null, claimable: false });
    const r = detail.props.request as { submittedBy: { email: unknown }; attachments: unknown[] };
    expect(r.submittedBy.email).toBeNull();
    expect(JSON.stringify(r.attachments)).not.toContain("secret-key");
  });

  it("demande d'une autre église : 404", async () => {
    mockAuth.mockResolvedValue(createSession({ churchRoles: [], pastoralChurchIds: ["church-1"] } as never));
    prismaMock.financialRequest.findUnique.mockResolvedValue(req("church-2") as never);
    await expect(AccountingDetailPage({ params })).rejects.toThrow("NOT_FOUND");
  });
});
