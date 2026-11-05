import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { viewerFor } from "./test-viewers";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

const { ask, recordFeedback } = await import("../services/ask");
const { recordPending, answerPending, linkPending } = await import("../services/pending");
const { patchEntry, deleteCustomEntry } = await import("../services/entries");
const { invalidateKnowledge, loadKnowledge } = await import("../services/knowledge");
const { LocalEngine } = await import("../services/engine");
const { NullEmbedder } = await import("../services/embedder");

const engine = new LocalEngine(new NullEmbedder());
const star = viewerFor("STAR", { predicates: ["linkedStar"] });
const runData = vi.fn();

function emptyBase() {
  prismaMock.assistantEntry.findMany.mockResolvedValue([]);
  prismaMock.assistantAlias.findMany.mockResolvedValue([]);
  prismaMock.assistantPendingQuestion.findMany.mockResolvedValue([]);
}

describe("question posée à l'assistant (spec 075)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateKnowledge();
    emptyBase();
  });

  it("répond par une fiche, compte la question, ne garde rien de la conversation", async () => {
    const response = await ask({ question: "je suis pas dispo dimanche" }, { viewer: star, runData, engine });
    expect(response).toMatchObject({ kind: "howto", key: "KB-021" });
    expect(prismaMock.assistantPendingQuestion.create).not.toHaveBeenCalled();
    const stat = prismaMock.assistantDailyStat.upsert.mock.calls[0][0];
    expect(stat.update).toEqual({ questions: { increment: 1 }, answered: { increment: 1 } });
  });

  it("exécute la question de données avec les paramètres extraits", async () => {
    runData.mockResolvedValue({ title: "Mon prochain service", items: [{ label: "dim. 8 nov. · Culte" }], total: 1, href: "/planning", hrefLabel: "Mon planning" });
    const response = await ask({ question: "c'est quand mon prochain service" }, { viewer: star, runData, engine });
    expect(response).toMatchObject({ kind: "data", key: "D01", data: { total: 1 } });
    expect(runData).toHaveBeenCalledWith("planning.myNextService", expect.any(Object));
  });

  it("transforme un refus du fournisseur en refus sans donnée", async () => {
    runData.mockResolvedValue({ refused: true });
    const response = await ask({ question: "c'est quand mon prochain service" }, { viewer: star, runData, engine });
    expect(response.kind).toBe("refused");
    expect(response).not.toHaveProperty("data");
  });

  it("remonte une question inconnue, anonymisée, avec le lien vers le guide", async () => {
    const response = await ask(
      { question: "xylophone quantique pour jean@exemple.fr", screen: "/planning" },
      { viewer: star, runData, engine }
    );
    expect(response).toMatchObject({ kind: "unknown", guideHref: "/guide" });
    const created = prismaMock.assistantPendingQuestion.create.mock.calls[0][0].data;
    expect(created).toEqual({ text: "xylophone quantique pour […]", reason: "UNANSWERED", screen: "/planning", role: "STAR" });
    expect(JSON.stringify(created)).not.toMatch(/user-1|church-1/);
  });

  it("nomme l'église courante quand le compte en a plusieurs", async () => {
    const response = await ask({ question: "je suis pas dispo dimanche" }, { viewer: { ...star, churchCount: 2 }, runData, engine });
    expect(response.church).toBe("Église de démonstration");
  });

  it("« Pas utile » remonte la question ; « Utile » ne fait que compter", async () => {
    await recordFeedback({ question: "comment je fais", helpful: true }, star);
    expect(prismaMock.assistantPendingQuestion.create).not.toHaveBeenCalled();
    await recordFeedback({ question: "comment je fais", helpful: false }, star);
    expect(prismaMock.assistantPendingQuestion.create.mock.calls[0][0].data.reason).toBe("NOT_HELPFUL");
  });
});

describe("questions à traiter et base (spec 075)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateKnowledge();
    emptyBase();
  });

  it("regroupe une question très proche d'une question ouverte", async () => {
    prismaMock.assistantPendingQuestion.findMany.mockResolvedValue([{ id: "p1", text: "Comment exporter mes STAR ?" }]);
    await recordPending({ text: "comment exporter mes star", reason: "UNANSWERED" });
    expect(prismaMock.assistantPendingQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" }, data: expect.objectContaining({ count: { increment: 1 } }) })
    );
    expect(prismaMock.assistantPendingQuestion.create).not.toHaveBeenCalled();
  });

  it("répondre crée une fiche qui sert dès la question suivante", async () => {
    prismaMock.assistantPendingQuestion.findUnique.mockResolvedValue({ id: "p1", text: "où se garer le dimanche" });
    prismaMock.assistantEntry.create.mockResolvedValue({ id: "c9" });
    prismaMock.assistantPendingQuestion.update.mockResolvedValue({ id: "p1", status: "ANSWERED" });
    await answerPending("p1", { title: "Parking", questions: ["parking"], answer: "Derrière l'église.", roles: [], screens: [] }, { id: "sa" });
    const data = prismaMock.assistantEntry.create.mock.calls[0][0].data;
    expect(data.questions).toEqual(["parking", "où se garer le dimanche"]);
    expect(prismaMock.assistantPendingQuestion.update.mock.calls[0][0].data).toMatchObject({ status: "ANSWERED", entryKey: "C-c9" });

    prismaMock.assistantEntry.findMany.mockResolvedValue([
      { id: "c9", source: "CUSTOM", builtinKey: null, title: "Parking", questions: data.questions, answer: "Derrière l'église.", href: null, hrefLabel: null, roles: [], module: null, screens: [], disabled: false },
    ]);
    const response = await ask({ question: "où se garer le dimanche ?" }, { viewer: star, runData, engine });
    expect(response).toMatchObject({ kind: "howto", key: "C-c9" });
  });

  it("rattacher ajoute une formulation à une fiche existante", async () => {
    prismaMock.assistantPendingQuestion.findUnique.mockResolvedValue({ id: "p2", text: "je bosse dimanche" });
    prismaMock.assistantPendingQuestion.update.mockResolvedValue({ id: "p2" });
    await linkPending("p2", "KB-021", { id: "sa" });
    expect(prismaMock.assistantAlias.create).toHaveBeenCalledWith({ data: { entryKey: "KB-021", text: "je bosse dimanche" } });
    await expect(linkPending("p2", "KB-999", { id: "sa" })).rejects.toThrow("Fiche inconnue");
  });

  it("une correction garde l'audience fournie ; le masquage cache la fiche", async () => {
    prismaMock.assistantEntry.findUnique.mockResolvedValue(null);
    await patchEntry("KB-040", { action: "override", entry: { title: "Planning", questions: ["faire le planning"], answer: "Texte", roles: ["STAR"], screens: [] } }, { id: "sa" });
    const upsert = prismaMock.assistantEntry.upsert.mock.calls[0][0];
    expect(upsert.create.roles).toEqual([]);
    prismaMock.assistantEntry.findMany.mockResolvedValue([
      { id: "o1", source: "OVERRIDE", builtinKey: "KB-040", title: "Planning", questions: ["faire le planning"], answer: "Texte", href: null, hrefLabel: null, roles: ["STAR"], module: null, screens: [], disabled: false },
    ]);
    invalidateKnowledge();
    const entry = (await loadKnowledge()).entries.find((e) => e.key === "KB-040");
    expect(entry?.audience).toEqual({ permissions: ["planning:edit"] });
  });

  it("refuse de supprimer une fiche fournie", async () => {
    await expect(deleteCustomEntry("KB-021", { id: "sa" })).rejects.toThrow(/se masque/);
  });
});
