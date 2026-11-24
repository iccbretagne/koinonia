import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import jsQR from "jsqr";
import { prismaMock } from "@/__mocks__/prisma";
import { defaultTicketVisual, ticketImageIds, ticketVisualSchema } from "../ticket-visual-schemas";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
const { logAudit } = await import("@/lib/audit");
const { addTicketImage, deleteTicketImage, getTicketVisual, prepareTicketImage, saveTicketVisual, unpublishTicketVisual, validateTicketVisual } = await import("../services/ticket-visual");
const { publicTicketVisual, renderTicketVisual, ticketVisualPdf } = await import("../services/ticket-render");
const doc = defaultTicketVisual("background");
const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#5e17eb" } }).png().toBuffer();

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
  prismaMock.ticketingEvent.findUniqueOrThrow.mockResolvedValue({ churchId: "c1", ticketVisualDraft: doc, ticketVisualPublished: null });
  prismaMock.ticketingTicketImage.findMany.mockResolvedValue([{ id: "background", width: 1000, height: 1500 }]);
  prismaMock.ticketingTicketImage.count.mockResolvedValue(1);
  prismaMock.ticketingTicketImage.create.mockResolvedValue({ id: "img", name: "fond", width: 1000, height: 1500 });
});

describe("document du billet", () => {
  it("borne les boîtes, refuse les URL/styles arbitraires et garde QR et nom générés", () => {
    expect(ticketVisualSchema.parse(doc)).toEqual(doc);
    for (const invalid of [
      { ...doc, qr: { ...doc.qr, size: 179 } },
      { ...doc, qr: { x: 820, y: 1300, size: 400 } },
      { ...doc, qr: { ...doc.qr, visible: false }, unknown: true },
      { ...doc, participant: { ...doc.participant, mode: "image", imageId: "img" } },
      { ...doc, location: { ...doc.location, x: 950 } },
      { ...doc, location: { ...doc.location, color: 'red" onload="evil()' } },
      { ...doc, date: { ...doc.date, font: "https://evil.test/font" } },
      { ...doc, date: { ...doc.date, mode: "image", imageId: null } },
    ]) expect(ticketVisualSchema.safeParse(invalid).success).toBe(false);
  });
  it("ne référence que le fond et les images visibles ; nom jamais une image", () => {
    const d = structuredClone(doc);
    d.date = { ...d.date, mode: "image", imageId: "date-image" };
    d.location = { ...d.location, mode: "image", imageId: "unused", visible: false };
    expect(ticketImageIds(d)).toEqual(["background", "date-image"]);
  });
  it("refuse l'image d'une autre église/événement, les fonds paysage et les fonds trop petits", async () => {
    prismaMock.ticketingTicketImage.findMany.mockResolvedValue([]);
    await expect(validateTicketVisual("event", doc)).rejects.toThrow(/appartient/);
    for (const [width, height] of [[1000, 500], [500, 800]]) {
      prismaMock.ticketingTicketImage.findMany.mockResolvedValue([{ id: "background", width, height }]);
      await expect(validateTicketVisual("event", doc)).rejects.toThrow(/portrait/);
    }
  });
});

describe("images et publication", () => {
  it("refuse les faux types sans écraser le document, réencode les images sans métadonnées", async () => {
    await expect(addTicketImage("event", "user", Buffer.from("<html>fake</html>"), "x.png")).rejects.toThrow(/Format/);
    expect(prismaMock.ticketingTicketImage.create).not.toHaveBeenCalled();
    expect(prismaMock.ticketingEvent.update).not.toHaveBeenCalled();
    const image = await prepareTicketImage(await png(800, 1200));
    expect(await sharp(Buffer.from(image.base64, "base64")).metadata()).toMatchObject({ format: "webp", width: 800, height: 1200 });
    expect((await sharp(Buffer.from(image.base64, "base64")).metadata()).exif).toBeUndefined();
  });
  it("limite les dépôts sous verrou et journalise le dépôt", async () => {
    await addTicketImage("event", "user", await png(800, 1200), "fond.png");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "TicketingTicketImage", churchId: "c1", userId: "user" }));
    prismaMock.ticketingTicketImage.count.mockResolvedValue(20);
    await expect(addTicketImage("event", "user", await png(800, 1200), "fond.png")).rejects.toThrow(/20 images/);
  });
  it("sépare brouillon et publié, journalise publication/retrait, conserve le brouillon au retrait", async () => {
    await saveTicketVisual("event", "user", doc);
    expect(prismaMock.ticketingEvent.update).toHaveBeenLastCalledWith({ where: { id: "event" }, data: { ticketVisualDraft: doc } });
    await saveTicketVisual("event", "user", doc, true);
    expect(prismaMock.ticketingEvent.update).toHaveBeenLastCalledWith({ where: { id: "event" }, data: { ticketVisualDraft: doc, ticketVisualPublished: doc } });
    expect(logAudit).toHaveBeenLastCalledWith(expect.objectContaining({ details: { operation: "publish" }, entityType: "TicketingTicketVisual" }));
    await unpublishTicketVisual("event", "user");
    const data = prismaMock.ticketingEvent.update.mock.calls.at(-1)![0].data;
    expect(data).toHaveProperty("ticketVisualPublished");
    expect(data).not.toHaveProperty("ticketVisualDraft");
    expect(await getTicketVisual("event")).toEqual({ draft: doc, published: null });
  });
  it("empêche de supprimer une image référencée, vérifie l'événement de la suppression", async () => {
    await expect(deleteTicketImage("event", "user", "background")).rejects.toThrow(/utilisée/);
    prismaMock.ticketingTicketImage.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteTicketImage("event", "user", "other-image")).rejects.toThrow(/introuvable/);
    expect(prismaMock.ticketingTicketImage.deleteMany).toHaveBeenCalledWith({ where: { id: "other-image", eventId: "event" } });
  });
});

describe("rendu et contrôle du QR", () => {
  it("le vrai lien secret est décodable à la taille minimale, sur fond chargé, avec un nom long échappé", async () => {
    const d = structuredClone(doc);
    d.qr.size = 180;
    d.participant = { ...d.participant, x: 0, y: 900, width: 1000, height: 600 };
    const link = `https://koinonia.example.org/billet/${"a".repeat(64)}`;
    const result = await renderTicketVisual(d, { participant: '<script>Un nom & très long "spécial"</script> '.repeat(10), date: "31 décembre 2027", location: "Palais des congrès", address: "1 rue de Rennes", qr: link }, new Map([["background", await png(1000, 1500)]]));
    const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(link);
    const quiet = await sharp(await sharp(result).extract({ left: d.qr.x + 1, top: d.qr.y + 1, width: d.qr.size - 2, height: 3 }).png().toBuffer()).removeAlpha().raw().toBuffer();
    expect([...quiet].every((c) => c === 255)).toBe(true);
    // Le PDF embarque le même PNG, aucune rasterisation supplémentaire du QR.
    const pdf = await ticketVisualPdf(result);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const pdfText = pdf.toString("latin1");
    expect(pdfText).toContain("/Width 1000");
    // Relit les pixels RGB réellement embarqués dans le PDF et les passe au même décodeur.
    const rgbHeader = pdfText.indexOf("/ColorSpace /DeviceRGB");
    const streamStart = pdfText.indexOf("stream\n", rgbHeader) + 7;
    const streamEnd = pdfText.indexOf("\nendstream", streamStart);
    const { inflateSync } = await import("node:zlib");
    const rgb = inflateSync(pdf.subarray(streamStart, streamEnd));
    const rgba = await sharp(rgb, { raw: { width: 1000, height: 1500, channels: 3 } }).ensureAlpha().raw().toBuffer();
    expect(jsQR(new Uint8ClampedArray(rgba), 1000, 1500)?.data).toBe(link);
    const { writeFile } = await import("node:fs/promises");
    await writeFile("/tmp/koinonia-ticket-visual-preview.png", result);
    await writeFile("/tmp/koinonia-ticket-visual-preview.pdf", pdf);
  });
  it("refuse une image manquante au rendu", async () => {
    await expect(renderTicketVisual(doc, { participant: "Nom", date: "Date", location: "Lieu", address: "", qr: "demo" }, new Map())).rejects.toThrow(/indisponible/);
  });
  it("un billet annulé ou inconnu ne produit aucun fichier, un brouillon non publié non plus", async () => {
    await expect(publicTicketVisual("invalide", "png")).rejects.toMatchObject({ statusCode: 404 });
    prismaMock.ticketingParticipant.findUnique.mockResolvedValue({ firstName: "Awa", lastName: "K", ageGroup: "ADULT", status: "CANCELLED", booking: { reference: "R-001" }, event: { church: { name: "Église" }, startsAt: new Date(), endsAt: new Date(), ticketVisualPublished: doc } });
    await expect(publicTicketVisual("a".repeat(64), "png")).rejects.toMatchObject({ statusCode: 404 });
    process.env.AUTH_URL = "https://koinonia.test";
    prismaMock.ticketingParticipant.findUnique.mockResolvedValue({ firstName: "Awa", lastName: "K", ageGroup: "ADULT", status: "ACTIVE", booking: { reference: "R-001" }, event: { church: { name: "Église" }, startsAt: new Date(), endsAt: new Date(), ticketVisualPublished: null } });
    prismaMock.ticketingParticipant.findUniqueOrThrow.mockResolvedValue({ eventId: "event", event: { ticketVisualPublished: null } });
    await expect(publicTicketVisual("a".repeat(64), "png")).rejects.toThrow(/publié/);
  });
});

describe("V2 : mesure réelle, composition et compatibilité", () => {
  const variables = {
    "participant.firstName": "Jean-Baptiste", "participant.lastName": "Kouamé N'Guessan",
    "participant.name": "Jean-Baptiste Kouamé N'Guessan", "ticket.category": "Adulte", "ticket.reference": "RESA-0042",
    "event.title": "Nuit de la Traversée 2027", "event.date": "jeudi 31 décembre 2026", "event.startTime": "18:00", "event.endTime": "05:00", "event.location": "Auditorium de Pacé", "event.address": "7 rue Charles Croizé, 35740 Pacé",
  };
  it("valide V1 et V2, convertit explicitement les positions, refuse variables et géométries dangereuses", async () => {
    const { defaultTicketVisualV2, convertTicketVisual } = await import("../ticket-visual-schemas");
    const v2 = defaultTicketVisualV2();
    expect(ticketVisualSchema.parse(JSON.parse(JSON.stringify(v2)))).toEqual(v2);
    const converted = convertTicketVisual(doc);
    expect(ticketVisualSchema.safeParse(converted).success).toBe(true);
    expect(converted.elements.find((e) => e.id === "participant")).toMatchObject({ x: doc.participant.x, y: doc.participant.y, width: doc.participant.width, height: doc.participant.height });
    expect(doc.version).toBe(1);
    for (const patch of [
      { x: 999 }, { width: 1800 }, { content: "{process.env.SECRET}" }, { content: "{__proto__}" }, { content: "{event.date" }, { x: 350, y: 850 },
    ]) expect(ticketVisualSchema.safeParse({ ...v2, elements: v2.elements.map((e, i) => i === 0 ? { ...e, ...patch } : e) }).success).toBe(false);
    expect(ticketVisualSchema.safeParse({ ...v2, elements: v2.elements.filter((e) => e.type !== "qrCode") }).success).toBe(false);
    expect(ticketVisualSchema.safeParse({ ...v2, elements: v2.elements.map((e) => e.type === "qrCode" ? { ...e, height: 299 } : e) }).success).toBe(false);
    expect(ticketVisualSchema.safeParse({ ...v2, elements: v2.elements.filter((e) => e.id !== "participant") }).success).toBe(false);
  });
  it("adapte le nom entier, conserve les accents et retours explicites et respecte les alignements", async () => {
    const { ticketTextStyleSchema } = await import("../ticket-visual-schemas");
    const { layoutTicketText } = await import("../services/ticket-text-layout");
    const text = "Marie-Angélique Jean-Baptiste De la Roche Saint-André Kouamé N'Guessan Ouattara";
    const style = ticketTextStyleSchema.parse({ fontSize: 100, minFontSize: 18, maxLines: 4, textAlign: "center", verticalAlign: "middle" });
    const layout = await layoutTicketText(text, 780, 150, style);
    expect(layout.fontSize).toBeLessThan(100);
    expect(layout.lines.map((l) => l.text).join(" ")).toBe(text);
    for (const line of layout.lines) {
      expect(line.x).toBeCloseTo((780 - line.width) / 2, 0);
      expect(line.y).toBeGreaterThanOrEqual(12);
      expect(line.y + line.height).toBeLessThanOrEqual(138);
    }
    for (const align of ["left", "center", "right"] as const) for (const vertical of ["top", "middle", "bottom"] as const) {
      const r = await layoutTicketText("Jean Koné", 700, 200, { ...style, fontSize: 40, minFontSize: 40, textAlign: align, verticalAlign: vertical });
      expect(r.lines[0].x).toBe(Math.round(align === "left" ? 12 : align === "center" ? (700 - r.lines[0].width) / 2 : 688 - r.lines[0].width));
      const top = (await layoutTicketText("Jean Koné", 700, 200, { ...style, fontSize: 40, minFontSize: 40, verticalAlign: "top" })).lines[0].y;
      expect(r.lines[0].y).toBeGreaterThanOrEqual(top);
      if (vertical !== "top") expect(r.lines[0].y).toBeGreaterThan(top);
    }
    const explicit = await layoutTicketText("Éléonore\nKoné", 400, 200, { ...style, fontSize: 40, autoFit: "wrap" });
    expect(explicit.lines.map((l) => l.text)).toEqual(["Éléonore", "Koné"]);
    const unbroken = "Éléonore".repeat(8);
    const wrapped = await layoutTicketText(unbroken, 260, 600, { ...style, fontSize: 30, maxLines: 30 });
    expect(wrapped.lines.map((l) => l.text).join("")).toBe(unbroken);
    for (const autoFit of ["fixed", "wrap", "shrink"] as const) await expect(layoutTicketText(text, 80, 50, { ...style, autoFit, maxLines: 1 })).rejects.toThrow(/aucun nom n'est tronqué/);
  });
  it("rend le vrai contenu QR et le PDF avec le même moteur, sans exécuter le texte", async () => {
    const { defaultTicketVisualV2 } = await import("../ticket-visual-schemas");
    const { renderTicketV2 } = await import("../services/ticket-render-v2");
    const payload = `https://koinonia.test/billet/${"b".repeat(64)}`;
    const d = defaultTicketVisualV2();
    const png = await renderTicketV2(d, variables, payload, new Map());
    const throughShared = await renderTicketVisual(d, { participant: variables["participant.name"], date: "", location: "", address: "", qr: payload, variables }, new Map());
    expect(throughShared.equals(png)).toBe(true);
    const raw = await sharp(png).ensureAlpha().raw().toBuffer();
    expect(jsQR(new Uint8ClampedArray(raw), 1000, 1500)?.data).toBe(payload);
    expect((await ticketVisualPdf(png)).subarray(0, 4).toString()).toBe("%PDF");
    const escaped = { ...variables, "participant.name": "<b>Éléonore & Koné</b>" };
    await expect(renderTicketV2(d, escaped, payload, new Map())).resolves.toBeInstanceOf(Buffer);
  });
  it("sauvegarde et relit V2 sans modifier le publié V1, refuse les images hors événement", async () => {
    const { defaultTicketVisualV2 } = await import("../ticket-visual-schemas");
    const d = defaultTicketVisualV2();
    prismaMock.ticketingTicketImage.count.mockResolvedValue(0);
    prismaMock.ticketingTicketImage.findMany.mockResolvedValue([]);
    prismaMock.ticketingEvent.findUniqueOrThrow.mockResolvedValue({ title: variables["event.title"], startsAt: new Date("2026-12-31T17:00:00Z"), endsAt: new Date("2027-01-01T04:00:00Z"), location: "Auditorium de Pacé", address: "7 rue Charles Croizé", churchId: "c1", ticketVisualDraft: d, ticketVisualPublished: doc });
    await saveTicketVisual("event", "user", d);
    expect(prismaMock.ticketingEvent.update).toHaveBeenCalledWith({ where: { id: "event" }, data: { ticketVisualDraft: d } });
    expect(await getTicketVisual("event")).toEqual({ draft: d, published: doc });
    const other = { ...d, elements: [...d.elements, { id: "other", name: "Logo", type: "image", imageId: "other-church", x: 0, y: 0, width: 100, height: 100, locked: false }] };
    await expect(validateTicketVisual("event", other)).rejects.toThrow(/appartient/);
  });
});

it("un ancien lien de billet rend V2 après publication, utilise ses données réelles et revérifie l'annulation", async () => {
  const { defaultTicketVisualV2 } = await import("../ticket-visual-schemas");
  const d = defaultTicketVisualV2();
  const token = "c".repeat(64);
  const event = { title: "Nuit de la Traversée 2027", startsAt: new Date("2026-12-31T17:00:00Z"), endsAt: new Date("2027-01-01T04:00:00Z"), location: "Auditorium de Pacé", address: "7 rue Charles Croizé", church: { name: "ICC Rennes" }, ticketVisualPublished: d };
  process.env.AUTH_URL = "https://koinonia.test";
  const participant = { firstName: "Jean", lastName: "Koné", ageGroup: "ADULT", status: "ACTIVE", booking: { reference: "EXEMPLE-0042" }, event };
  prismaMock.ticketingParticipant.findUnique.mockResolvedValue(participant);
  prismaMock.ticketingParticipant.findUniqueOrThrow.mockResolvedValue({ eventId: "event", event });
  prismaMock.ticketingTicketImage.findMany.mockResolvedValue([]);
  const result = await publicTicketVisual(token, "png");
  const raw = await sharp(result).ensureAlpha().raw().toBuffer();
  expect(jsQR(new Uint8ClampedArray(raw), 1000, 1500)?.data).toBe(`https://koinonia.test/billet/${token}`);
  prismaMock.ticketingParticipant.findUnique.mockResolvedValueOnce(participant).mockResolvedValueOnce({ status: "CANCELLED" });
  await expect(publicTicketVisual(token, "png")).rejects.toThrow(/introuvable/);
});
