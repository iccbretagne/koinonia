import { beforeEach, expect, it, vi } from "vitest";
import { defaultTicketVisual } from "@/modules/ticketing/schemas";
import { viewerFor } from "../../assistant/__tests__/viewers";

let saved: unknown = null;
let roles = new Set(["ORGANIZER"]);
let churchId = "c1";
let changed = false;
const doc = defaultTicketVisual("bg");
const confirmation = {
  publicOrigin: () => "https://koinonia.test",
  createConfirmation: vi.fn(async (_g: string, _a: string, payload: unknown) => { saved = payload; return { token: "kmx_visual", expiresAt: new Date("2099-01-01") }; }),
  consumeConfirmation: vi.fn(async () => { const result = saved; saved = null; return result; }),
};
vi.mock("@/modules/mcp", () => confirmation);
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), withAuditContext: async (_: unknown, fn: () => unknown) => fn() }));
const fetchImage = vi.fn(async () => Buffer.from("source"));
vi.mock("@/lib/safe-fetch", () => ({ safeFetchImage: (...a: unknown[]) => fetchImage(...a as []) }));
const svc = {
  isTicketingManager: vi.fn(async () => false),
  listEvents: vi.fn(async () => [{ id: "e1", title: "Événement" }]),
  getEventAccess: vi.fn(async () => ({ churchId, roles })),
  canDo: (access: { roles: Set<string> }, action: string) => action === "read" ? access.roles.size > 0 : access.roles.has("ORGANIZER"),
  getEventDetail: vi.fn(async () => ({ startsAt: new Date("2099-01-01"), location: "Salle", address: "Rue" })),
  getTicketVisual: vi.fn(async () => ({ draft: changed ? { ...doc, qr: { ...doc.qr, x: 0 } } : doc, published: null })),
  listTicketImages: vi.fn(async () => [{ id: "bg", width: 1000, height: 1500 }]),
  validateTicketVisual: vi.fn(async (_e: string, d: unknown) => d),
  previewTicketVisual: vi.fn(async () => Buffer.from("png")),
  saveTicketVisual: vi.fn(async () => ({})),
  unpublishTicketVisual: vi.fn(async () => ({})),
  prepareTicketImage: vi.fn(async () => ({ width: 1000, height: 1500, base64: "c291cmNl" })),
  addTicketImage: vi.fn(async () => ({ id: "image" })),
  decodeBase64Image: (s: string) => Buffer.from(s, "base64"),
};
vi.mock("@/modules/ticketing", () => svc);
const { TICKET_VISUAL_ACTIONS } = await import("../_actions/ticket-visual");
const ctx = { session: { user: { id: "user" } } as never, churchId: "c1", viewer: viewerFor("STAR", { predicates: ["ticketing"] }), grantId: "g1" };
const run = (name: string, input: unknown) => TICKET_VISUAL_ACTIONS.find((a) => a.name === name)!.run(input as never, ctx);
beforeEach(() => { vi.clearAllMocks(); saved = null; changed = false; churchId = "c1"; roles = new Set(["ORGANIZER"]); });

it("lecture et lien de dépôt disponibles sans drapeau des sites ; ne publie rien", async () => {
  expect(TICKET_VISUAL_ACTIONS.every((a) => a.available(ctx.viewer))).toBe(true);
  const r = await run("ticketing_ticket_visual", { event: "e1" });
  expect(r.structured.editor).toBe("https://koinonia.test/billetterie/e1?vue=billet");
  expect(svc.saveTicketVisual).not.toHaveBeenCalled();
});
it("aperçu puis confirmation unique, via le service de l'écran", async () => {
  const r = await run("edit_ticketing_ticket_visual_preview", { event: "e1", document: doc, publish: true });
  expect(r.structured.confirmation).toBe("kmx_visual");
  expect(svc.previewTicketVisual).toHaveBeenCalledWith("e1", doc);
  expect(svc.saveTicketVisual).not.toHaveBeenCalled();
  expect((await run("edit_ticketing_ticket_visual_confirm", { confirmation: "kmx_visual" })).structured.done).toBe(true);
  expect(svc.saveTicketVisual).toHaveBeenCalledWith("e1", ctx.viewer.userId, doc, true);
  expect((await run("edit_ticketing_ticket_visual_confirm", { confirmation: "kmx_visual" })).structured.done).toBe(false);
});
it("refuse autre église, lecture seule, perte du rôle et changement concurrent", async () => {
  churchId = "other";
  expect((await run("edit_ticketing_ticket_visual_preview", { event: "e1", document: doc })).structured.done).toBe(false);
  churchId = "c1"; roles = new Set(["OBSERVER"]);
  expect((await run("edit_ticketing_ticket_visual_preview", { event: "e1", document: doc })).structured.done).toBe(false);
  roles = new Set(["ORGANIZER"]);
  await run("edit_ticketing_ticket_visual_preview", { event: "e1", document: doc, publish: true });
  roles = new Set(["OBSERVER"]);
  expect((await run("edit_ticketing_ticket_visual_confirm", { confirmation: "kmx_visual" })).structured.done).toBe(false);
  roles = new Set(["ORGANIZER"]);
  await run("edit_ticketing_ticket_visual_preview", { event: "e1", document: doc, publish: true }); changed = true;
  expect((await run("edit_ticketing_ticket_visual_confirm", { confirmation: "kmx_visual" })).text).toContain("changé");
  expect(svc.saveTicketVisual).not.toHaveBeenCalled();
});
it("importe un fichier via safeFetchImage après aperçu, aucun ajout avant confirmation", async () => {
  await run("upload_ticketing_ticket_image_preview", { event: "e1", name: "Fond", file: { download_url: "https://files.example.org/bg.png", file_id: "f1" } });
  expect(fetchImage).toHaveBeenCalledWith("https://files.example.org/bg.png");
  expect(svc.addTicketImage).not.toHaveBeenCalled();
  expect((await run("upload_ticketing_ticket_image_confirm", { confirmation: "kmx_visual" })).structured.done).toBe(true);
  expect(svc.addTicketImage).toHaveBeenCalledWith("e1", ctx.viewer.userId, Buffer.from("source"), "Fond");
  expect((await run("upload_ticketing_ticket_image_preview", { event: "e1", name: "Fond" })).structured.done).toBe(false);
});
