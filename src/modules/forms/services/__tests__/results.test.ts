import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { aggregate } = await import("../results");

/** Résultats regroupés et participation (spec 079, lot 3). */

const q = (id: string, type: string, position: number, extra: Record<string, unknown> = {}) => ({
  id,
  formId: "f1",
  position,
  type,
  label: id.toUpperCase(),
  help: null,
  required: false,
  config: null,
  conditionQuestionId: null,
  conditionValue: null,
  choices: [],
  ...extra,
});
const atelier = q("atelier", "SINGLE_CHOICE", 2, {
  choices: [
    { id: "a", label: "Atelier A", capacity: 2 },
    { id: "b", label: "Atelier B", capacity: null },
  ],
});
const form = (kind: string, questions: unknown[]) => ({ id: "f1", kind, anonymous: kind === "SURVEY", questions, sessions: [] }) as never;
const row = (answers: Record<string, unknown>) => ({ answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })) });

describe("résultats regroupés", () => {
  const survey = form("SURVEY", [
    q("note", "RATING", 0),
    q("avis", "LONG_TEXT", 1),
    atelier,
    q("mail", "EMAIL", 3),
    q("dates", "MULTIPLE_CHOICE", 4, { choices: [{ id: "d1", label: "Samedi", capacity: null }, { id: "d2", label: "Dimanche", capacity: null }] }),
  ]);

  it("effectifs, moyenne des notes, choix multiples, places", () => {
    const r = aggregate(survey, [row({ note: 5, atelier: "a", dates: ["d1", "d2"] }), row({ note: 3, atelier: "a", dates: ["d1"] }), row({ note: 4 })]);
    expect(r.responses).toBe(3);
    const note = r.questions.find((x) => x.questionId === "note");
    expect(note).toMatchObject({ kind: "rating", answered: 3, average: 4, distribution: [0, 0, 1, 1, 1] });
    expect(r.questions.find((x) => x.questionId === "atelier")).toMatchObject({
      kind: "choices",
      answered: 2,
      items: [
        { id: "a", count: 2, capacity: 2 },
        { id: "b", count: 0, capacity: null },
      ],
    });
    expect(r.questions.find((x) => x.questionId === "dates")).toMatchObject({ items: [{ count: 2 }, { count: 1 }] });
    expect(r.participation).toBeNull();
  });

  it("anonymat : textes triés (jamais dans l'ordre d'arrivée), coordonnées seulement comptées", () => {
    const r = aggregate(survey, [row({ avis: "Zèle", mail: "a@b.fr" }), row({ avis: "Accueil chaleureux", mail: "c@d.fr" })]);
    expect(r.questions.find((x) => x.questionId === "avis")).toMatchObject({ kind: "texts", texts: ["Accueil chaleureux", "Zèle"] });
    const mail = r.questions.find((x) => x.questionId === "mail");
    expect(mail).toEqual({ kind: "count", questionId: "mail", label: "MAIL", answered: 2 });
    expect(JSON.stringify(r)).not.toContain("a@b.fr");
  });
});

describe("participation", () => {
  const participation = form("PARTICIPATION", [
    q("vient", "YES_NO", 0, { config: { participation: "attendance" } }),
    q("plus", "NUMBER", 1, { config: { min: 0, max: 5, participation: "companions" } }),
    atelier,
  ]);

  it("total des participants : personnes qui viennent et leurs accompagnants", () => {
    const r = aggregate(participation, [
      row({ vient: true, plus: 2, atelier: "a" }),
      row({ vient: true, plus: 0, atelier: "a" }),
      row({ vient: false, plus: 3 }),
      row({ vient: true }),
    ]);
    expect(r.participation).toEqual({ attending: 3, notAttending: 1, companions: 2, total: 5 });
    // Atelier plein : 2 / 2.
    expect(r.questions.find((x) => x.questionId === "atelier")).toMatchObject({ items: [{ count: 2, capacity: 2 }, { count: 0 }] });
  });

  it("sans question « Je viens » : chaque réponse confirmée compte", () => {
    const r = aggregate(form("PARTICIPATION", [q("plus", "NUMBER", 0, { config: { participation: "companions" } })]), [row({ plus: 1 }), row({})]);
    expect(r.participation).toEqual({ attending: 2, notAttending: 0, companions: 1, total: 3 });
  });
});
