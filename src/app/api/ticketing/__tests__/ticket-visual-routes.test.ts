import { beforeEach, expect, it, vi } from "vitest";
import { defaultTicketVisual } from "@/modules/ticketing/schemas";
let role = "ORGANIZER";
vi.mock("@/modules/ticketing/auth", () => ({ requireEventAction: async (id: string, action: string) => {
  if (id !== "e1" || !role || (action === "configure" && role !== "ORGANIZER")) throw new Error("FORBIDDEN");
  return { session: { user: { id: "u1" } } };
} }));
vi.mock("@/lib/rate-limit", () => ({ requireRateLimit: vi.fn(), getClientIp: () => "127.0.0.1" }));
const svc = {
  saveTicketVisual: vi.fn(async () => ({})), getTicketVisual: vi.fn(async () => ({ draft: null, published: null })), unpublishTicketVisual: vi.fn(async () => undefined),
  addTicketImage: vi.fn(async () => ({ id: "img" })), listTicketImages: vi.fn(async () => []),
  previewTicketVisual: vi.fn(async () => Buffer.from("PNG")),
  publicTicketVisual: vi.fn(async () => Buffer.from("PNG")),
};
vi.mock("@/modules/ticketing", () => svc);
const route = await import("../events/[id]/ticket-visual/route");
const images = await import("../events/[id]/ticket-visual/images/route");
const pub = await import("../public/tickets/[token]/visual/route");
const params = { params: Promise.resolve({ id: "e1" }) };
const request = (data: unknown) => new Request("http://localhost/api/ticketing/events/e1/ticket-visual", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
beforeEach(() => { vi.clearAllMocks(); role = "ORGANIZER"; });
it("les rôles de lecture consultent mais ne modifient pas ; les écritures valident Zod", async () => {
  role = "OBSERVER";
  expect((await route.GET(request({}), params)).status).toBe(200);
  expect((await route.PUT(request({ document: defaultTicketVisual("bg") }), params)).status).toBe(403);
  expect((await route.DELETE(request({}), params)).status).toBe(403);
  expect(svc.saveTicketVisual).not.toHaveBeenCalled();
  role = "ORGANIZER";
  expect((await route.PUT(request({ document: {} }), params)).status).toBe(400);
  expect((await route.PUT(request({ document: defaultTicketVisual("bg"), publish: true }), params)).status).toBe(200);
  expect(svc.saveTicketVisual).toHaveBeenCalledWith("e1", "u1", defaultTicketVisual("bg"), true);
});
it("le dépôt refuse un fichier absent ou trop lourd, sans appel au service", async () => {
  expect((await images.POST(new Request("http://localhost", { method: "POST", body: new FormData() }), params)).status).toBe(400);
  expect((await images.POST(new Request("http://localhost", { method: "POST", headers: { "content-length": String(9 * 1024 * 1024) } }), params)).status).toBe(413);
  expect(svc.addTicketImage).not.toHaveBeenCalled();
});
it("les téléchargements passent par le jeton existant, sans cache et avec un nom fixe", async () => {
  const res = await pub.GET(new Request("http://localhost/visual?format=pdf&download=1"), { params: Promise.resolve({ token: "secret" }) });
  expect(svc.publicTicketVisual).toHaveBeenCalledWith("secret", "pdf");
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(res.headers.get("content-disposition")).toBe('attachment; filename="billet.pdf"');
  expect((await pub.GET(new Request("http://localhost/visual?format=svg"), { params: Promise.resolve({ token: "secret" }) })).status).toBe(400);
});
