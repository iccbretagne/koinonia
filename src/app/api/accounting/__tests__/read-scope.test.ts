/**
 * Tests — audit sécurité : périmètre de lecture comptable. Le filtre ?departmentId= restreint
 * le périmètre autorisé sans le remplacer ; les séries suivent le même périmètre ; la route
 * locale des pièces applique les règles du téléchargement principal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createSession, createAdminSession, createDepartmentHeadSession } from "@/__mocks__/auth";

const mockRequireCurrentChurchPermission = vi.fn();
const mockRequireAuth = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireCurrentChurchPermission: (...args: unknown[]) => mockRequireCurrentChurchPermission(...args),
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
  buildAccountingNewRequestEmail: vi.fn(),
  parseEmailList: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/file-storage", () => ({
  S3_CONFIGURED: false,
  serveLocalFile: vi.fn().mockResolvedValue({ buffer: Buffer.from("pdf"), mimeType: "application/pdf" }),
}));
vi.mock("next-auth", () => ({
  default: () => ({ auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));

const { GET: listRequests } = await import("../requests/route");
const { GET: listSeries } = await import("../series/route");
const { GET: getLocalAttachment } = await import("../attachments/local/route");

const headSession = createDepartmentHeadSession([{ id: "dept-a", name: "A" }]);

function asDepartmentHead() {
  mockRequireCurrentChurchPermission.mockResolvedValue({ session: headSession, churchId: "church-1" });
  prismaMock.userChurchRole.findMany.mockResolvedValue([
    { ministryId: null, departments: [{ departmentId: "dept-a" }] },
  ] as never);
}

const scopeOf = (userId: string) => ({
  OR: [{ departmentId: { in: ["dept-a"] } }, { submittedById: userId }],
});

describe("GET /api/accounting/requests — périmètre", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.financialRequest.findMany.mockResolvedValue([]);
  });

  it("?departmentId= d'un autre département ne lève pas le périmètre", async () => {
    asDepartmentHead();

    await listRequests(new Request("http://localhost/api/accounting/requests?departmentId=dept-b"));

    expect(prismaMock.financialRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ churchId: "church-1", departmentId: "dept-b", ...scopeOf(headSession.user.id!) }),
      })
    );
  });

  it("accounting:manage voit toute l'église, filtre compris", async () => {
    mockRequireCurrentChurchPermission.mockResolvedValue({ session: createAdminSession(), churchId: "church-1" });

    await listRequests(new Request("http://localhost/api/accounting/requests?departmentId=dept-b"));

    const where = prismaMock.financialRequest.findMany.mock.calls[0][0]!.where;
    expect(where).toEqual({ churchId: "church-1", departmentId: "dept-b" });
  });
});

describe("GET /api/accounting/series — périmètre", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.financialSeries.findMany.mockResolvedValue([]);
  });

  it("un responsable ne voit que les séries de ses départements et les siennes", async () => {
    asDepartmentHead();

    await listSeries(new Request("http://localhost/api/accounting/series"));

    expect(prismaMock.financialSeries.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { churchId: "church-1", ...scopeOf(headSession.user.id!) } })
    );
  });
});

describe("GET /api/accounting/attachments/local — règles du téléchargement principal", () => {
  const url = "http://localhost/api/accounting/attachments/local?key=accounting/church-1/x.pdf";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse une pièce orpheline déposée par quelqu'un d'autre", async () => {
    mockRequireAuth.mockResolvedValue({ ...headSession, user: { ...headSession.user, id: "user-2" } });
    prismaMock.financialAttachment.findFirst.mockResolvedValue({
      uploadedById: "user-1", churchId: "church-1", requestId: null,
    } as never);

    const res = await getLocalAttachment(new Request(url));
    expect(res.status).toBe(403);
  });

  it("refuse une pièce d'une autre église, même avec accounting:manage ailleurs", async () => {
    mockRequireAuth.mockResolvedValue(createAdminSession("church-2"));
    prismaMock.financialAttachment.findFirst.mockResolvedValue({
      uploadedById: "user-9", churchId: "church-1", requestId: "req-1",
    } as never);

    const res = await getLocalAttachment(new Request(url));
    expect(res.status).toBe(403);
  });

  it("sert la pièce à son déposant", async () => {
    mockRequireAuth.mockResolvedValue(createSession({ id: "user-1" }));
    prismaMock.financialAttachment.findFirst.mockResolvedValue({
      uploadedById: "user-1", churchId: "church-1", requestId: null,
    } as never);

    const res = await getLocalAttachment(new Request(url));
    expect(res.status).toBe(200);
  });
});
