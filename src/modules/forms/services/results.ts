import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { CHOICE_TYPES, type QuestionType } from "../schemas";
import { getForm, type FormWithQuestions } from "./builder";

/**
 * Résultats regroupés d'un formulaire (spec 079, lot 3) : un agrégat par question, calculé sur
 * les réponses confirmées. Aucune identité n'en sort, sondage anonyme ou non : les textes libres
 * sont rendus seuls et **triés** (jamais dans l'ordre d'arrivée, qui pourrait les rattacher à une
 * personne) ; les emails et téléphones ne sont que comptés.
 */

export type QuestionResult =
  | { kind: "choices"; questionId: string; label: string; type: QuestionType; answered: number; items: { id: string; label: string; count: number; capacity: number | null }[] }
  | { kind: "rating"; questionId: string; label: string; answered: number; average: number | null; distribution: number[] }
  | { kind: "number"; questionId: string; label: string; answered: number; sum: number; average: number | null; min: number | null; max: number | null }
  | { kind: "texts"; questionId: string; label: string; answered: number; texts: string[] }
  | { kind: "count"; questionId: string; label: string; answered: number };

export interface ParticipationSummary {
  /** Réponses confirmées « Je viens » (toutes, sans question « Je viens »). */
  attending: number;
  notAttending: number;
  companions: number;
  /** Participants : personnes qui viennent + leurs accompagnants. */
  total: number;
}

export interface FormResults {
  responses: number;
  questions: QuestionResult[];
  participation: ParticipationSummary | null;
}

const MAX_TEXTS = 500;

function participationRoles(form: FormWithQuestions) {
  const role = (r: string) => form.questions.find((q) => (q.config as { participation?: string } | null)?.participation === r);
  return { attendance: role("attendance"), companions: role("companions") };
}

/** Agrégats à partir des valeurs déjà validées (une liste de valeurs par question). */
export function aggregate(form: FormWithQuestions, rows: { answers: { questionId: string; value: unknown }[] }[]): FormResults {
  const byQuestion = new Map<string, unknown[]>();
  for (const r of rows) for (const a of r.answers) byQuestion.set(a.questionId, [...(byQuestion.get(a.questionId) ?? []), a.value]);

  const questions: QuestionResult[] = form.questions.map((q) => {
    const values = byQuestion.get(q.id) ?? [];
    const base = { questionId: q.id, label: q.label, answered: values.length };
    if (CHOICE_TYPES.includes(q.type)) {
      const counts = new Map<string, number>();
      for (const v of values) for (const id of Array.isArray(v) ? v : [v]) counts.set(String(id), (counts.get(String(id)) ?? 0) + 1);
      return { kind: "choices", type: q.type, ...base, items: q.choices.map((c) => ({ id: c.id, label: c.label, count: counts.get(c.id) ?? 0, capacity: c.capacity })) };
    }
    switch (q.type) {
      case "YES_NO":
      case "CONSENT": {
        const yes = values.filter((v) => v === true).length;
        const labels = q.type === "YES_NO" ? ["Oui", "Non"] : ["Accepté", "Refusé"];
        return {
          kind: "choices",
          type: q.type,
          ...base,
          items: [
            { id: "true", label: labels[0], count: yes, capacity: null },
            { id: "false", label: labels[1], count: values.length - yes, capacity: null },
          ],
        };
      }
      case "SESSION_LEVEL": {
        const counts = new Map<string, number>();
        for (const v of values) {
          const levelId = (v as { levelId?: string } | null)?.levelId;
          if (levelId) counts.set(levelId, (counts.get(levelId) ?? 0) + 1);
        }
        const items = form.sessions.flatMap((s) =>
          s.levels.map((l) => ({ id: l.id, label: `${s.label} — niveau ${l.code}`, count: counts.get(l.id) ?? 0, capacity: l.capacity }))
        );
        return { kind: "choices", type: q.type, ...base, items };
      }
      case "RATING": {
        const notes = values.filter((v): v is number => typeof v === "number");
        const distribution = [1, 2, 3, 4, 5].map((n) => notes.filter((x) => x === n).length);
        return { kind: "rating", ...base, average: notes.length ? round(notes.reduce((a, b) => a + b, 0) / notes.length) : null, distribution };
      }
      case "NUMBER": {
        const nums = values.filter((v): v is number => typeof v === "number");
        const sum = nums.reduce((a, b) => a + b, 0);
        return {
          kind: "number",
          ...base,
          sum,
          average: nums.length ? round(sum / nums.length) : null,
          min: nums.length ? Math.min(...nums) : null,
          max: nums.length ? Math.max(...nums) : null,
        };
      }
      case "SHORT_TEXT":
      case "LONG_TEXT":
      case "DATE": {
        const texts = values.filter((v): v is string => typeof v === "string" && v.trim() !== "");
        return { kind: "texts", ...base, texts: texts.sort((a, b) => a.localeCompare(b, "fr")).slice(0, MAX_TEXTS) };
      }
      default:
        // Email, téléphone : coordonnées, jamais listées dans les résultats.
        return { kind: "count", ...base };
    }
  });

  let participation: ParticipationSummary | null = null;
  if (form.kind === "PARTICIPATION") {
    const { attendance, companions } = participationRoles(form);
    let attending = 0;
    let notAttending = 0;
    let extra = 0;
    for (const r of rows) {
      const values = new Map(r.answers.map((a) => [a.questionId, a.value]));
      const comes = attendance ? values.get(attendance.id) === true : true;
      if (!comes) {
        notAttending += 1;
        continue;
      }
      attending += 1;
      const n = companions ? values.get(companions.id) : 0;
      if (typeof n === "number" && n > 0) extra += n;
    }
    participation = { attending, notAttending, companions: extra, total: attending + extra };
  }
  return { responses: rows.length, questions, participation };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Résultats d'un formulaire, bornés au périmètre d'un intervenant le cas échéant. */
export async function formResults(formId: string, scope: Prisma.FormResponseWhereInput = {}): Promise<FormResults & { form: FormWithQuestions }> {
  const form = await getForm(formId);
  if (!form) throw new Error("Formulaire introuvable");
  const rows = await prisma.formResponse.findMany({
    where: { AND: [{ formId, status: "CONFIRMED" }, scope] },
    select: { answers: { select: { questionId: true, value: true } } },
  });
  return { ...aggregate(form, rows), form };
}
