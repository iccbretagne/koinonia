import {
  DECIMALS_MAX,
  DEFAULT_QUALIFIERS,
  FILE_REQUEST_STATUSES,
  GROUP_MAX_ROWS,
  NOTE_MAX_LENGTH,
  TEXT_MAX_LENGTH,
  isValidDay,
  type CampaignDefinition,
  type DefinitionItem,
  type DefinitionSection,
  type FileRequestStatus,
  type Qualifier,
  type ScalarItem,
} from "../schemas";
import { ruleCodes } from "./rules";

/**
 * Définition d'une campagne (spec 090) : contrôles sémantiques après Zod, et validation d'une
 * réponse à partir de son item. Pur, sans base : seule porte d'entrée des valeurs enregistrées.
 * Zéro est une valeur ; une case vide n'est jamais convertie en zéro.
 */

/** Réponse telle que stockée (`CampaignAnswer`). */
export interface StoredAnswer {
  value: unknown;
  qualifier: Qualifier;
  note: string | null;
}

export type AnswerCheck =
  | { ok: true; value: unknown; qualifier: Qualifier; note: string | null }
  | { ok: false; error: string };

/** Types dont la valeur peut entrer dans une règle. */
const RULE_TYPES = new Set<DefinitionItem["type"]>(["integer", "decimal", "yesno"]);

/** Les items de premier niveau d'un questionnaire, dans l'ordre. */
export function flattenItems(sections: readonly DefinitionSection[]): DefinitionItem[] {
  return sections.flatMap((s) => s.items);
}

/** Index des items de premier niveau par code. */
export function itemIndex(sections: readonly DefinitionSection[]): Map<string, DefinitionItem> {
  return new Map(flattenItems(sections).map((item) => [item.code, item]));
}

function checkBounds(where: string, min: number | undefined, max: number | undefined, errors: string[]) {
  if (min !== undefined && max !== undefined && min > max) errors.push(`${where} : minimum supérieur au maximum`);
}

function checkScalar(item: ScalarItem, where: string, errors: string[]) {
  if (item.type === "integer" || item.type === "decimal") checkBounds(where, item.min, item.max, errors);
  if (item.type === "single" || item.type === "multiple") {
    const keys = new Set<string>();
    for (const c of item.choices) {
      if (keys.has(c.key)) errors.push(`${where} : choix « ${c.key} » en double`);
      keys.add(c.key);
      if (c.exclusive && item.type !== "multiple") {
        errors.push(`${where} : un choix exclusif n'a de sens qu'en choix multiple`);
      }
    }
    if (item.type === "multiple" && item.choices.every((c) => c.exclusive)) {
      errors.push(`${where} : tous les choix sont exclusifs`);
    }
  }
}

/**
 * Contrôles qu'un schéma Zod ne peut pas faire : unicité des codes dans toute la campagne
 * (sous-champs de groupe compris) et des clés, références des règles, choix, bornes.
 * Renvoie des messages lisibles, vide si la définition est cohérente.
 */
export function validateDefinition(def: CampaignDefinition): string[] {
  const errors: string[] = [];
  const codes = new Map<string, DefinitionItem | ScalarItem>();
  const topLevel = new Map<string, DefinitionItem>();
  const formKeys = new Set<string>();

  const claim = (code: string, item: DefinitionItem | ScalarItem, where: string) => {
    if (codes.has(code)) errors.push(`${where} : code « ${code} » déjà utilisé dans la campagne`);
    else codes.set(code, item);
  };

  if (def.campaign.periodStart && def.campaign.periodEnd && def.campaign.periodStart > def.campaign.periodEnd) {
    errors.push("Campagne : le début de période doit précéder sa fin");
  }

  for (const form of def.forms) {
    const at = `Questionnaire « ${form.key} »`;
    if (formKeys.has(form.key)) errors.push(`${at} : clé en double`);
    formKeys.add(form.key);

    const assignmentKeys = new Set<string>();
    for (const a of form.assignments) {
      if (assignmentKeys.has(a.key)) errors.push(`${at} : destinataire « ${a.key} » en double`);
      assignmentKeys.add(a.key);
    }

    const sectionKeys = new Set<string>();
    for (const section of form.sections) {
      if (sectionKeys.has(section.key)) errors.push(`${at} : section « ${section.key} » en double`);
      sectionKeys.add(section.key);

      for (const item of section.items) {
        const where = `${at}, ${item.code}`;
        claim(item.code, item, where);
        if (!topLevel.has(item.code)) topLevel.set(item.code, item);
        if (item.type === "group") {
          checkBounds(`${where} (lignes)`, item.minRows, item.maxRows, errors);
          for (const field of item.fields) {
            claim(field.code, field, `${where}.${field.code}`);
            checkScalar(field, `${where}.${field.code}`, errors);
          }
        } else if (item.type !== "file_request") {
          checkScalar(item, where, errors);
        }
      }
    }
  }

  const ruleKeys = new Set<string>();
  for (const rule of def.rules ?? []) {
    const at = `Règle « ${rule.key} »`;
    if (ruleKeys.has(rule.key)) errors.push(`${at} : clé en double`);
    ruleKeys.add(rule.key);
    const used = ruleCodes(rule);
    if (used.length === 0) errors.push(`${at} : aucun code`);
    for (const code of used) {
      const item = topLevel.get(code);
      if (!item) {
        errors.push(
          codes.has(code)
            ? `${at} : « ${code} » est un champ de groupe, non utilisable dans une règle`
            : `${at} : code « ${code} » inconnu`
        );
      } else if (!RULE_TYPES.has(item.type)) {
        errors.push(`${at} : « ${code} » (${item.type}) n'est ni un nombre ni un oui/non`);
      }
    }
  }
  return errors;
}

// ── Réponses ───────────────────────────────────────────────────────────────────────────────────

/** Vide : absent, chaîne blanche, liste vide, groupe sans ligne. Jamais zéro ni `false`. */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object" && "rows" in value && !("none" in value)) {
    const rows = (value as { rows: unknown }).rows;
    return Array.isArray(rows) && rows.length === 0;
  }
  return false;
}

/** Qualificatifs permis pour un item (`EXACT` toujours ; aucun autre pour groupe et fichier). */
export function allowedQualifiers(item: DefinitionItem): Qualifier[] {
  if (item.type === "group" || item.type === "file_request") return ["EXACT"];
  const declared = item.qualifiers ?? DEFAULT_QUALIFIERS;
  return ["EXACT", ...declared.filter((q) => q !== "EXACT")];
}

type Parsed = { ok: true; value: unknown } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function hasAtMostDecimals(n: number, decimals: number): boolean {
  return Number(n.toFixed(decimals)) === n;
}

function parseNumber(item: Extract<ScalarItem, { type: "integer" | "decimal" }>, value: unknown): Parsed {
  if (typeof value !== "number" || !Number.isFinite(value)) return fail("Un nombre est attendu");
  if (item.type === "integer" && !Number.isInteger(value)) return fail("Un nombre entier est attendu");
  if (item.type === "decimal") {
    const decimals = item.decimals ?? DECIMALS_MAX;
    if (!hasAtMostDecimals(value, decimals)) {
      return fail(decimals === 0 ? "Un nombre sans décimale est attendu" : `${decimals} décimale(s) au plus`);
    }
  }
  if (item.min !== undefined && value < item.min) return fail(`Minimum : ${item.min}`);
  if (item.max !== undefined && value > item.max) return fail(`Maximum : ${item.max}`);
  return { ok: true, value };
}

/** Valeur non vide d'un item scalaire. */
function parseScalar(item: ScalarItem, value: unknown): Parsed {
  switch (item.type) {
    case "integer":
    case "decimal":
      return parseNumber(item, value);
    case "text":
    case "longtext": {
      if (typeof value !== "string") return fail("Un texte est attendu");
      const text = value.trim();
      const max = item.maxLength ?? TEXT_MAX_LENGTH[item.type];
      return text.length > max ? fail(`${max} caractères au plus`) : { ok: true, value: text };
    }
    case "yesno":
      return typeof value === "boolean" ? { ok: true, value } : fail("Oui ou non est attendu");
    case "single":
      return typeof value === "string" && item.choices.some((c) => c.key === value)
        ? { ok: true, value }
        : fail("Choix inconnu");
    case "multiple": {
      if (!Array.isArray(value) || !value.every((v): v is string => typeof v === "string")) {
        return fail("Une liste de choix est attendue");
      }
      const picked = new Set(value);
      if (![...picked].every((k) => item.choices.some((c) => c.key === k))) return fail("Choix inconnu");
      const exclusive = item.choices.find((c) => c.exclusive && picked.has(c.key));
      if (exclusive && picked.size > 1) return fail(`« ${exclusive.label} » ne se combine avec aucun autre choix`);
      // Ordre de la définition, sans doublon.
      return { ok: true, value: item.choices.filter((c) => picked.has(c.key)).map((c) => c.key) };
    }
    case "date":
      return typeof value === "string" && isValidDay(value) ? { ok: true, value } : fail("Date AAAA-MM-JJ attendue");
  }
}

function parseGroup(item: Extract<DefinitionItem, { type: "group" }>, value: unknown): Parsed {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail("Valeur de groupe invalide");
  const obj = value as Record<string, unknown>;
  if ("none" in obj) {
    return obj.none === true && Object.keys(obj).length === 1
      ? { ok: true, value: { none: true } }
      : fail("Valeur de groupe invalide");
  }
  const rows = obj.rows;
  if (!Array.isArray(rows) || Object.keys(obj).length !== 1) return fail("Valeur de groupe invalide");
  const maxRows = item.maxRows ?? GROUP_MAX_ROWS;
  if (rows.length > maxRows) return fail(`${maxRows} ligne(s) au plus`);

  const out: Record<string, unknown>[] = [];
  for (const [i, row] of rows.entries()) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) return fail(`Ligne ${i + 1} invalide`);
    const cells = row as Record<string, unknown>;
    const unknown = Object.keys(cells).find((k) => !item.fields.some((f) => f.code === k));
    if (unknown) return fail(`Ligne ${i + 1} : champ « ${unknown} » inconnu`);
    const parsedRow: Record<string, unknown> = {};
    // Champ vide accepté (brouillon) : les obligatoires sont vérifiés par `isAnswered`.
    for (const field of item.fields) {
      const cell = cells[field.code];
      if (isEmptyValue(cell)) {
        parsedRow[field.code] = null;
        continue;
      }
      const parsed = parseScalar(field, cell);
      if (!parsed.ok) return fail(`Ligne ${i + 1}, ${field.label} : ${parsed.error}`);
      parsedRow[field.code] = parsed.value;
    }
    out.push(parsedRow);
  }
  return { ok: true, value: { rows: out } };
}

function parseValue(item: DefinitionItem, value: unknown): Parsed {
  if (item.type === "group") return parseGroup(item, value);
  if (item.type === "file_request") {
    const status = (value as { status?: unknown } | null)?.status;
    const valid =
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 1 &&
      FILE_REQUEST_STATUSES.includes(status as FileRequestStatus);
    return valid ? { ok: true, value: { status } } : fail("État de la demande de fichier invalide");
  }
  return parseScalar(item, value);
}

/**
 * Valide une réponse (sauvegarde partielle) : valeur selon le type, qualificatif permis, note.
 * Une valeur vide en `EXACT` efface la réponse (valeur nulle).
 */
export function validateAnswerValue(
  item: DefinitionItem,
  value: unknown,
  qualifier: Qualifier = "EXACT",
  note: string | null | undefined = null
): AnswerCheck {
  const cleanNote = note?.trim() ? note.trim() : null;
  if (cleanNote && cleanNote.length > NOTE_MAX_LENGTH) return fail(`Précision : ${NOTE_MAX_LENGTH} caractères au plus`);
  if (!allowedQualifiers(item).includes(qualifier)) return fail("Qualificatif non autorisé pour cette question");

  const empty = isEmptyValue(value);
  if (qualifier === "NOT_APPLICABLE" || qualifier === "NSP") {
    return empty ? { ok: true, value: null, qualifier, note: cleanNote } : fail("Ce qualificatif ne porte pas de valeur");
  }
  if (qualifier === "ESTIMATE" && (empty || !cleanNote)) return fail("Une estimation demande une valeur et une précision");
  if (qualifier === "TO_RESEARCH" && !cleanNote) return fail("« À rechercher » demande une note");
  if (empty) return { ok: true, value: null, qualifier, note: cleanNote };

  const parsed = parseValue(item, value);
  return parsed.ok ? { ok: true, value: parsed.value, qualifier, note: cleanNote } : parsed;
}

// ── Complétude ─────────────────────────────────────────────────────────────────────────────────

function groupComplete(item: Extract<DefinitionItem, { type: "group" }>, value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  if ((value as { none?: unknown }).none === true) return true;
  const rows = (value as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length < Math.max(1, item.minRows ?? 1)) return false;
  return rows.every((row: Record<string, unknown>) =>
    item.fields.every((f) => !f.required || (row[f.code] !== null && row[f.code] !== undefined))
  );
}

/**
 * Item renseigné au sens de la soumission : valeur valide, ou `TO_RESEARCH`/`NOT_APPLICABLE`/
 * `NSP` ; pour une demande de fichier, un état, et au moins un fichier si « fichier transmis ».
 */
export function isAnswered(item: DefinitionItem, answer: StoredAnswer | undefined, fileCount = 0): boolean {
  if (!answer) return false;
  if (["TO_RESEARCH", "NOT_APPLICABLE", "NSP"].includes(answer.qualifier)) return true;
  if (answer.value === null || answer.value === undefined) return false;
  if (item.type === "group") return groupComplete(item, answer.value);
  if (item.type === "file_request") {
    const status = (answer.value as { status?: unknown }).status;
    return status === "FILE_SENT" ? fileCount > 0 : FILE_REQUEST_STATUSES.includes(status as FileRequestStatus);
  }
  return true;
}

export interface Completeness {
  /** Obligatoires non renseignés, et « fichier transmis » sans fichier. */
  missing: string[];
  estimates: string[];
  /** Qualificatif « à rechercher », et demandes de fichier à l'état « à rechercher ». */
  toResearch: string[];
  /** Demandes de fichier qui attendent un fichier (« fichier transmis » ou déjà un dépôt). */
  filesExpected: number;
  /** Parmi elles, celles qui ont au moins un fichier. */
  filesReceived: number;
}

export function completeness(
  items: readonly DefinitionItem[],
  answersByCode: ReadonlyMap<string, StoredAnswer>,
  fileCountByCode: ReadonlyMap<string, number> = new Map()
): Completeness {
  const result: Completeness = { missing: [], estimates: [], toResearch: [], filesExpected: 0, filesReceived: 0 };
  for (const item of items) {
    const answer = answersByCode.get(item.code);
    const files = fileCountByCode.get(item.code) ?? 0;
    const answered = isAnswered(item, answer, files);

    if (item.type === "file_request") {
      const status = (answer?.value as { status?: unknown } | null | undefined)?.status;
      if (status === "FILE_SENT" || files > 0) {
        result.filesExpected++;
        if (files > 0) result.filesReceived++;
      }
      if (status === "TO_RESEARCH") result.toResearch.push(item.code);
      if ((item.required && !answered) || (status === "FILE_SENT" && files === 0)) result.missing.push(item.code);
      continue;
    }
    if (item.required && !answered) result.missing.push(item.code);
    if (answer?.qualifier === "ESTIMATE") result.estimates.push(item.code);
    if (answer?.qualifier === "TO_RESEARCH") result.toResearch.push(item.code);
  }
  return result;
}
