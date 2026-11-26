/**
 * Tests — niveau questionnaire des campagnes (spec 090) : sauvegarde partielle (zéro conservé),
 * soumission bloquée puis acceptée, correction puis resoumission et validation, cloisonnement des
 * liens personnels, fichier renommé refusé. Prisma est simulé par une petite base en mémoire.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

const model = () => ({
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
});
const db = {
  campaign: model(),
  campaignForm: model(),
  campaignAssignment: model(),
  campaignRespondent: model(),
  campaignAnswer: model(),
  campaignFile: model(),
  userChurchRole: model(),
  $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(db)),
};

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(), requireCurrentChurchPermission: vi.fn() }));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit }));
const notify = {
  notifyAssignmentSubmitted: vi.fn(),
  notifyChangesRequested: vi.fn(),
  notifyRespondentAdded: vi.fn(),
  respondentLink: vi.fn(() => "https://exemple.test/collecte/x"),
};
vi.mock("../services/notify", () => notify);
const storage = { storeFile: vi.fn(), deleteFile: vi.fn(async () => {}), readStoredFile: vi.fn() };
vi.mock("@/lib/file-storage", () => storage);

process.env.CAMPAIGNS_TOKEN_SECRET = "secret-de-test";

const { saveAnswers, submitAssignment, reviewAssignment, getAssignmentView } = await import("../services/assignments");
const { storeCampaignFile, readCampaignFile } = await import("../services/files");
const { requireTokenAccess } = await import("../auth");
const { respondentTokenPair } = await import("../services/tokens");

const DEFINITION = {
  sections: [
    {
      key: "s",
      title: "Section",
      items: [
        { code: "A", type: "integer", label: "Nombre A", required: true, qualifiers: ["ESTIMATE", "TO_RESEARCH"] },
        { code: "B", type: "integer", label: "Nombre B", required: true },
        { code: "F", type: "file_request", label: "Export", accept: ["xlsx"] },
      ],
    },
  ],
};
const RULES = [{ key: "a-b", message: "A ≥ B", check: { gte: ["A", "B"] } }];

type Row = { code: string; value: unknown; qualifier: string; note: string | null };
let answers: Map<string, Row>;
let assignmentStatus: string;
let campaignStatus: string;

const access = (role: "respondent" | "manager" = "respondent") =>
  ({
    role,
    actor: { kind: "user", userId: "u1", name: "Alice", session: {} },
    assignment: { id: "as1", churchId: "c1", campaignId: "cp1", formId: "f1", status: assignmentStatus, campaignStatus },
    ...(role === "respondent" ? { respondentId: "r1" } : {}),
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  answers = new Map();
  assignmentStatus = "NOT_STARTED";
  campaignStatus = "OPEN";

  db.campaignForm.findUnique.mockImplementation(async () => ({
    revision: 3,
    definition: DEFINITION,
    campaign: { rules: RULES },
  }));
  db.campaignAssignment.findUnique.mockImplementation(async (args: { select?: { answers?: unknown } }) => {
    const base = { status: assignmentStatus, campaign: { status: campaignStatus } };
    if (!args.select?.answers) return base;
    return {
      id: "as1",
      key: "integration",
      label: "Intégration",
      status: assignmentStatus,
      dueAt: null,
      reviewReason: null,
      startedAt: null,
      submittedAt: null,
      submittedByName: null,
      validatedAt: null,
      pastoralValidated: false,
      form: { id: "f1", key: "integration", title: "Intégration", confidential: false, revision: 3, definition: DEFINITION },
      campaign: {
        id: "cp1",
        title: "F9",
        description: null,
        periodStart: null,
        periodEnd: null,
        dueAt: new Date("2026-12-04T22:59:00Z"),
        status: campaignStatus,
        rules: RULES,
      },
      answers: [...answers.values()].map((a) => ({ ...a, updatedByName: "Alice", updatedAt: new Date() })),
      files: [],
    };
  });
  db.campaignAssignment.updateMany.mockImplementation(async ({ data }: { data: { status: string } }) => {
    assignmentStatus = data.status;
    return { count: 1 };
  });
  db.campaignAnswer.findMany.mockImplementation(async () => [...answers.values()]);
  db.campaignAnswer.upsert.mockImplementation(async ({ create }: { create: Row & { value: unknown } }) => {
    const value = create.value !== null && typeof create.value === "object" && !Array.isArray(create.value) && !("status" in create.value) ? null : create.value;
    answers.set(create.code, { code: create.code, value, qualifier: create.qualifier, note: create.note ?? null });
  });
  db.campaignAnswer.deleteMany.mockImplementation(async ({ where }: { where: { code: string } }) => {
    answers.delete(where.code);
  });
  db.campaignFile.findMany.mockResolvedValue([]);
});

describe("saveAnswers", () => {
  it("sauvegarde partielle : zéro conservé, passage « En cours » journalisé une fois, alertes locales", async () => {
    const first = await saveAnswers(access(), [{ code: "A", value: 0 }]);
    expect(answers.get("A")?.value).toBe(0);
    expect(first.status).toBe("IN_PROGRESS");
    expect(first.completeness.missing).toEqual(["B"]);
    expect(logAudit).toHaveBeenCalledTimes(1);

    const second = await saveAnswers(access(), [{ code: "B", value: 5, qualifier: "ESTIMATE", note: "Comptage partiel" }]);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(second.completeness.missing).toEqual([]);
    expect(second.completeness.estimates).toEqual(["B"]);
    expect(second.alerts).toEqual([expect.objectContaining({ key: "a-b", result: "violated" })]);

    const view = await getAssignmentView(access());
    expect(view.answers.A.value).toBe(0);
    expect(view.answers.B).toMatchObject({ value: 5, qualifier: "ESTIMATE", note: "Comptage partiel" });
    expect(view.editable).toBe(true);
    expect(view.assignment.dueAt).toEqual(new Date("2026-12-04T22:59:00Z"));
  });

  it("vide en « exacte » sans note : la ligne est supprimée, jamais convertie en zéro", async () => {
    answers.set("A", { code: "A", value: 3, qualifier: "EXACT", note: null });
    await saveAnswers(access(), [{ code: "A", value: "" }]);
    expect(answers.has("A")).toBe(false);
  });

  it("code inconnu, valeur invalide ou estimation sans précision : 400, rien n'est écrit", async () => {
    await expect(saveAnswers(access(), [{ code: "Z9", value: 1 }])).rejects.toMatchObject({ statusCode: 400 });
    await expect(saveAnswers(access(), [{ code: "A", value: 1.5 }])).rejects.toMatchObject({ statusCode: 400 });
    await expect(saveAnswers(access(), [{ code: "A", value: 4, qualifier: "ESTIMATE" }])).rejects.toMatchObject({ statusCode: 400 });
    expect(db.campaignAnswer.upsert).not.toHaveBeenCalled();
  });

  it("questionnaire soumis : 409", async () => {
    assignmentStatus = "SUBMITTED";
    await expect(saveAnswers(access(), [{ code: "A", value: 1 }])).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("submitAssignment / reviewAssignment", () => {
  it("refusée tant qu'une obligatoire est vide (libellé cité), acceptée ensuite", async () => {
    assignmentStatus = "IN_PROGRESS";
    answers.set("A", { code: "A", value: 0, qualifier: "EXACT", note: null });
    await expect(submitAssignment(access())).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("Nombre B") });
    expect(notify.notifyAssignmentSubmitted).not.toHaveBeenCalled();

    answers.set("B", { code: "B", value: null, qualifier: "TO_RESEARCH", note: "Demandé au PVS" });
    const result = await submitAssignment(access());
    expect(result.status).toBe("SUBMITTED");
    expect(db.campaignAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUBMITTED", submittedById: "u1", submittedByName: "Alice", definitionRevision: 3 }),
      })
    );
    expect(notify.notifyAssignmentSubmitted).toHaveBeenCalledWith("as1");
  });

  it("correction demandée → modifiable → resoumission → validation avec la case Pasteure", async () => {
    answers.set("A", { code: "A", value: 2, qualifier: "EXACT", note: null });
    answers.set("B", { code: "B", value: 1, qualifier: "EXACT", note: null });
    assignmentStatus = "SUBMITTED";

    await expect(reviewAssignment(access("manager"), { action: "request_changes" })).rejects.toMatchObject({ statusCode: 400 });
    expect(await reviewAssignment(access("manager"), { action: "request_changes", reason: "B à vérifier" })).toEqual({
      status: "CHANGES_REQUESTED",
    });
    expect(notify.notifyChangesRequested).toHaveBeenCalledWith("as1", "B à vérifier");

    await saveAnswers(access(), [{ code: "B", value: 2 }]);
    expect(answers.get("B")?.value).toBe(2);
    expect((await submitAssignment(access())).status).toBe("SUBMITTED");

    const validated = await reviewAssignment(access("manager"), { action: "validate", pastoralValidated: true });
    expect(validated).toEqual({ status: "VALIDATED", pastoralValidated: true });
    expect(db.campaignAssignment.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "as1", status: "SUBMITTED" },
        data: expect.objectContaining({ status: "VALIDATED", validatedById: "u1", pastoralValidated: true }),
      })
    );
  });

  it("demande de correction sur une campagne clôturée : 409", async () => {
    assignmentStatus = "SUBMITTED";
    campaignStatus = "CLOSED";
    await expect(reviewAssignment(access("manager"), { action: "request_changes", reason: "x" })).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe("liens personnels", () => {
  const token = respondentTokenPair("r1", "a".repeat(32)).token;
  const respondentRow = {
    id: "r1",
    name: "Bob",
    tokenHash: respondentTokenPair("r1", "a".repeat(32)).hash,
    assignment: { id: "as1", churchId: "c1", campaignId: "cp1", formId: "f1", status: "IN_PROGRESS", campaign: { status: "OPEN", churchId: "c1" } },
  };

  it("le lien n'ouvre que son questionnaire : fichier d'une autre affectation ⇒ 404", async () => {
    db.campaignRespondent.findUnique.mockImplementation(async (args: { where: { tokenHash?: string } }) =>
      args.where.tokenHash ? respondentRow : { addedById: "u9" }
    );
    const tokenAccess = await requireTokenAccess(token);
    expect(tokenAccess.assignment.id).toBe("as1");

    db.campaignFile.findUnique.mockResolvedValue({ id: "file2", assignmentId: "as2", storageKey: "k", name: "x.pdf", mime: "application/pdf" });
    await expect(readCampaignFile(tokenAccess, "file2")).rejects.toMatchObject({ statusCode: 404 });
    expect(storage.readStoredFile).not.toHaveBeenCalled();
  });

  it("lien inconnu ou campagne clôturée : 404", async () => {
    db.campaignRespondent.findUnique.mockResolvedValue(null);
    await expect(requireTokenAccess(token)).rejects.toMatchObject({ statusCode: 404 });
    db.campaignRespondent.findUnique.mockResolvedValue({
      ...respondentRow,
      assignment: { ...respondentRow.assignment, campaign: { status: "CLOSED", churchId: "c1" } },
    });
    await expect(requireTokenAccess(token)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("storeCampaignFile", () => {
  it("exécutable renommé en .xlsx : refusé, rien n'est stocké", async () => {
    assignmentStatus = "IN_PROGRESS";
    const exe = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])], "export.xlsx");
    await expect(storeCampaignFile(access(), "F", exe)).rejects.toMatchObject({ statusCode: 400 });
    expect(storage.storeFile).not.toHaveBeenCalled();
  });

  it("vrai XLSX : stocké sous la clé de l'affectation, état « fichier transmis » posé", async () => {
    assignmentStatus = "IN_PROGRESS";
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("xl/workbook.xml", "<workbook/>");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    db.campaignFile.count.mockResolvedValue(0);
    db.campaignFile.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "file1", ...data }));
    db.campaignAnswer.findUnique.mockResolvedValue(null);

    const stored = await storeCampaignFile(access(), "F", new File([bytes as BlobPart], "Export <nouveaux>.xlsx"));
    expect(stored).toMatchObject({ id: "file1", name: "Export _nouveaux_.xlsx" });
    expect(storage.storeFile.mock.calls[0][0]).toMatch(/^campaigns\/c1\/cp1\/as1\/[0-9a-f-]{36}\.xlsx$/);
    expect(answers.get("F")?.value).toEqual({ status: "FILE_SENT" });
  });

  it("question qui n'attend pas de fichier : 400", async () => {
    assignmentStatus = "IN_PROGRESS";
    await expect(storeCampaignFile(access(), "A", new File(["%PDF-1.4"], "a.pdf"))).rejects.toMatchObject({ statusCode: 400 });
  });
});
