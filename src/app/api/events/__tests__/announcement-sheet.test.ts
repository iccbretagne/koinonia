import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

const mockRequireChurchPermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");

vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockCanDeposit = vi.fn();
const mockCanRead = vi.fn();
const mockNotifyReaders = vi.fn();
const mockValidateSheetFile = vi.fn();
const mockGetAnnouncementSheetKey = vi.fn().mockReturnValue("announcement-sheets/church-1/event-1/sheet-1.pdf");

vi.mock("@/modules/planning", () => ({
  canDepositAnnouncementSheet: (...args: unknown[]) => mockCanDeposit(...args),
  canReadAnnouncementSheet: (...args: unknown[]) => mockCanRead(...args),
  notifyReaders: (...args: unknown[]) => mockNotifyReaders(...args),
  validateSheetFile: (...args: unknown[]) => mockValidateSheetFile(...args),
  getAnnouncementSheetKey: (...args: unknown[]) => mockGetAnnouncementSheetKey(...args),
  ALLOWED_SHEET_MIME_TYPES: {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  },
}));

const mockGetSignedPutUrl = vi.fn().mockResolvedValue("https://s3.example.com/put-url");
const mockFileExists = vi.fn();
const mockGetSignedDownloadUrl = vi.fn().mockResolvedValue("https://s3.example.com/download-url");
const mockDeleteMediaFile = vi.fn();

vi.mock("@/modules/storage", () => ({
  getSignedPutUrl: (...args: unknown[]) => mockGetSignedPutUrl(...args),
  fileExists: (...args: unknown[]) => mockFileExists(...args),
  getSignedDownloadUrl: (...args: unknown[]) => mockGetSignedDownloadUrl(...args),
  deleteMediaFile: (...args: unknown[]) => mockDeleteMediaFile(...args),
}));

const { POST: signPOST } = await import("../[eventId]/announcement-sheet/sign/route");
const {
  POST: confirmPOST,
  GET: confirmGET,
  DELETE: confirmDELETE,
} = await import("../[eventId]/announcement-sheet/route");

const eventIdParams = { params: Promise.resolve({ eventId: "event-1" }) };

describe("POST /api/events/[eventId]/announcement-sheet/sign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockCanDeposit.mockResolvedValue(true);
  });

  it("renvoie 403 si l'utilisateur ne peut pas déposer", async () => {
    mockCanDeposit.mockResolvedValue(false);
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ filename: "annonces.pdf", mimeType: "application/pdf", size: 1000 }),
    });

    const res = await signPOST(request, eventIdParams);
    expect(res.status).toBe(403);
  });

  it("valide le fichier (mimeType/size) puis renvoie la clé et l'URL signées", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ filename: "annonces.pdf", mimeType: "application/pdf", size: 1000 }),
    });

    const res = await signPOST(request, eventIdParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockValidateSheetFile).toHaveBeenCalledWith("application/pdf", 1000);
    expect(body.key).toBe("announcement-sheets/church-1/event-1/sheet-1.pdf");
    expect(body.url).toBe("https://s3.example.com/put-url");
  });

  it("renvoie 400 si la validation Zod échoue (mimeType absent)", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ filename: "annonces.pdf", size: 1000 }),
    });

    const res = await signPOST(request, eventIdParams);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/events/[eventId]/announcement-sheet (confirmation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockCanDeposit.mockResolvedValue(true);
    prismaMock.event.findFirst.mockResolvedValue({ id: "event-1", title: "Culte" } as never);
    mockFileExists.mockResolvedValue(true);
  });

  it("crée la feuille (dépôt initial) et notifie sans isUpdate", async () => {
    prismaMock.announcementSheet.findUnique.mockResolvedValue(null);
    prismaMock.announcementSheet.upsert.mockResolvedValue({
      id: "sheet-1",
      key: "announcement-sheets/church-1/event-1/sheet-1.pdf",
      filename: "annonces.pdf",
    } as never);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        key: "announcement-sheets/church-1/event-1/sheet-1.pdf",
        filename: "annonces.pdf",
        mimeType: "application/pdf",
      }),
    });

    const res = await confirmPOST(request, eventIdParams);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.sheet.filename).toBe("annonces.pdf");
    expect(mockDeleteMediaFile).not.toHaveBeenCalled();
    expect(mockNotifyReaders).toHaveBeenCalledWith("church-1", "event-1", "Culte", false);
  });

  it("remplace la feuille existante, supprime l'ancien objet S3 et notifie avec isUpdate", async () => {
    prismaMock.announcementSheet.findUnique.mockResolvedValue({
      id: "sheet-1",
      key: "announcement-sheets/church-1/event-1/old.pdf",
    } as never);
    prismaMock.announcementSheet.upsert.mockResolvedValue({
      id: "sheet-1",
      key: "announcement-sheets/church-1/event-1/new.pdf",
      filename: "annonces-v2.pdf",
    } as never);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        key: "announcement-sheets/church-1/event-1/new.pdf",
        filename: "annonces-v2.pdf",
        mimeType: "application/pdf",
      }),
    });

    const res = await confirmPOST(request, eventIdParams);
    expect(res.status).toBe(201);
    expect(mockDeleteMediaFile).toHaveBeenCalledWith("announcement-sheets/church-1/event-1/old.pdf");
    expect(mockNotifyReaders).toHaveBeenCalledWith("church-1", "event-1", "Culte", true);
  });

  it("renvoie 404 si l'objet S3 n'existe pas encore", async () => {
    mockFileExists.mockResolvedValue(false);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        key: "announcement-sheets/church-1/event-1/sheet-1.pdf",
        filename: "annonces.pdf",
        mimeType: "application/pdf",
      }),
    });

    const res = await confirmPOST(request, eventIdParams);
    expect(res.status).toBe(404);
  });

  it("renvoie 403 si l'utilisateur ne peut pas déposer", async () => {
    mockCanDeposit.mockResolvedValue(false);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        key: "announcement-sheets/church-1/event-1/sheet-1.pdf",
        filename: "annonces.pdf",
        mimeType: "application/pdf",
      }),
    });

    const res = await confirmPOST(request, eventIdParams);
    expect(res.status).toBe(403);
  });

  it("renvoie 404 si l'événement n'existe pas", async () => {
    prismaMock.event.findFirst.mockResolvedValue(null);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        key: "announcement-sheets/church-1/event-1/sheet-1.pdf",
        filename: "annonces.pdf",
        mimeType: "application/pdf",
      }),
    });

    const res = await confirmPOST(request, eventIdParams);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/events/[eventId]/announcement-sheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockCanRead.mockResolvedValue(true);
  });

  it("renvoie la feuille avec une URL de téléchargement signée", async () => {
    prismaMock.announcementSheet.findUnique.mockResolvedValue({
      key: "announcement-sheets/church-1/event-1/sheet-1.pdf",
      filename: "annonces.pdf",
      uploadedAt: new Date("2026-09-10T10:00:00.000Z"),
      uploadedBy: { name: "Jean Dupont", displayName: null },
    } as never);

    const res = await confirmGET(new Request("http://localhost"), eventIdParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sheet.filename).toBe("annonces.pdf");
    expect(body.sheet.uploadedBy).toBe("Jean Dupont");
    expect(body.downloadUrl).toBe("https://s3.example.com/download-url");
  });

  it("renvoie sheet: null si aucune feuille n'est déposée", async () => {
    prismaMock.announcementSheet.findUnique.mockResolvedValue(null);

    const res = await confirmGET(new Request("http://localhost"), eventIdParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sheet).toBeNull();
  });

  it("renvoie 403 pour un utilisateur non lecteur", async () => {
    mockCanRead.mockResolvedValue(false);

    const res = await confirmGET(new Request("http://localhost"), eventIdParams);
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/events/[eventId]/announcement-sheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockCanDeposit.mockResolvedValue(true);
  });

  it("supprime la feuille et l'objet S3", async () => {
    prismaMock.announcementSheet.findUnique.mockResolvedValue({
      id: "sheet-1",
      key: "announcement-sheets/church-1/event-1/sheet-1.pdf",
    } as never);

    const res = await confirmDELETE(new Request("http://localhost"), eventIdParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(prismaMock.announcementSheet.delete).toHaveBeenCalledWith({ where: { eventId: "event-1" } });
    expect(mockDeleteMediaFile).toHaveBeenCalledWith("announcement-sheets/church-1/event-1/sheet-1.pdf");
  });

  it("renvoie 403 pour un utilisateur non déposant", async () => {
    mockCanDeposit.mockResolvedValue(false);

    const res = await confirmDELETE(new Request("http://localhost"), eventIdParams);
    expect(res.status).toBe(403);
  });

  it("renvoie 404 si aucune feuille n'est déposée", async () => {
    prismaMock.announcementSheet.findUnique.mockResolvedValue(null);

    const res = await confirmDELETE(new Request("http://localhost"), eventIdParams);
    expect(res.status).toBe(404);
  });
});
