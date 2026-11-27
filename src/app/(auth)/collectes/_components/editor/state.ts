import {
  campaignDefinitionSchema,
  validateDefinition,
  type CampaignDefinition,
  type Comparator,
  type DefinitionAssignment,
  type DefinitionChoice,
  type DefinitionForm,
  type DefinitionItem,
  type DefinitionSection,
  type ItemType,
  type Operand,
  type Rule,
  type RuleCheck,
  type ScalarItem,
  type ScalarItemType,
} from "@/modules/campaigns/schemas";

/**
 * État de l'éditeur graphique des campagnes (spec 091, EVOL-11) : un document `koinonia.campaign`
 * v1 complet, transformé par des fonctions **pures** (aucune mutation, aucun React). Les
 * identifiants sont générés une fois (codes `Q_` + 6 caractères base 36, clés `f-`, `s-`, `d-`,
 * `r-`, `c-` + 6), vérifiés uniques dans le document, jamais recalculés depuis un libellé : une
 * duplication en génère de nouveaux, y compris pour les sous-champs et les choix.
 */

/** Source d'aléa (remplaçable dans les tests). */
export type Random = () => number;

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

export function randomChars(length: number, random: Random = Math.random): string {
  let out = "";
  for (let i = 0; i < length; i++) out += BASE36[Math.floor(random() * 36) % 36];
  return out;
}

/** Tous les identifiants du document : clés (campagne, questionnaires, destinataires, sections, règles, choix) et codes. */
export function collectIds(def: CampaignDefinition): Set<string> {
  const ids = new Set<string>([def.campaign.key]);
  const addItem = (item: DefinitionItem | ScalarItem) => {
    ids.add(item.code);
    if (item.type === "single" || item.type === "multiple") item.choices.forEach((c) => ids.add(c.key));
    if (item.type === "group") item.fields.forEach(addItem);
  };
  for (const form of def.forms) {
    ids.add(form.key);
    form.assignments.forEach((a) => ids.add(a.key));
    for (const section of form.sections) {
      ids.add(section.key);
      section.items.forEach(addItem);
    }
  }
  (def.rules ?? []).forEach((r) => ids.add(r.key));
  return ids;
}

function unique(make: () => string, taken: Set<string>): string {
  for (;;) {
    const id = make();
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

/** Nouveau code de question, unique dans le document (`taken` est complété). */
export const newCode = (taken: Set<string>, random: Random = Math.random) =>
  unique(() => `Q_${randomChars(6, random).toUpperCase()}`, taken);

export type KeyPrefix = "f" | "s" | "d" | "r" | "c";

/** Nouvelle clé `f-` (questionnaire), `s-` (section), `d-` (destinataire), `r-` (règle), `c-` (choix). */
export const newKey = (prefix: KeyPrefix, taken: Set<string>, random: Random = Math.random) =>
  unique(() => `${prefix}-${randomChars(6, random)}`, taken);

/** Clé d'une nouvelle campagne (unique par église : plus longue). */
export const newCampaignKey = (random: Random = Math.random) => `campagne-${randomChars(8, random)}`;

/** Champ facultatif : valeur vide (`undefined`, chaîne blanche) ⇒ clé retirée de l'objet. */
export function withOptional<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined | null): T {
  const copy = { ...obj };
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) delete copy[key];
  else copy[key] = value;
  return copy;
}

/** Déplace l'élément `index` de `delta` (−1 : monter, +1 : descendre) ; hors bornes : inchangé. */
export function move<T>(list: readonly T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const out = [...list];
  const [item] = out.splice(index, 1);
  out.splice(to, 0, item);
  return out;
}

const replaceAt = <T>(list: readonly T[], index: number, value: T): T[] => list.map((x, i) => (i === index ? value : x));
const removeAt = <T>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index);
const insertAfter = <T>(list: readonly T[], index: number, value: T): T[] => [...list.slice(0, index + 1), value, ...list.slice(index + 1)];

// ── Fabriques ──────────────────────────────────────────────────────────────────────────────────

function newChoices(taken: Set<string>, random: Random): DefinitionChoice[] {
  return [
    { key: newKey("c", taken, random), label: "Choix 1" },
    { key: newKey("c", taken, random), label: "Choix 2" },
  ];
}

/** Question vierge d'un type scalaire. */
export function newScalarItem(type: ScalarItemType, taken: Set<string>, random: Random = Math.random): ScalarItem {
  const base = { code: newCode(taken, random), label: "Nouvelle question" };
  if (type === "single" || type === "multiple") return { ...base, type, choices: newChoices(taken, random) };
  return { ...base, type } as ScalarItem;
}

/** Question vierge de n'importe quel type (un groupe naît avec un sous-champ texte). */
export function newItem(type: ItemType, taken: Set<string>, random: Random = Math.random): DefinitionItem {
  if (type === "group") {
    return {
      code: newCode(taken, random),
      label: "Nouveau groupe",
      type,
      fields: [{ ...newScalarItem("text", taken, random), label: "Nouveau champ" }],
    };
  }
  if (type === "file_request") return { code: newCode(taken, random), label: "Nouvelle demande de fichier", type };
  return newScalarItem(type, taken, random);
}

export function newSection(taken: Set<string>, random: Random = Math.random): DefinitionSection {
  return { key: newKey("s", taken, random), title: "Nouvelle section", items: [newItem("integer", taken, random)] };
}

export function newAssignment(taken: Set<string>, random: Random = Math.random, label = "Nouveau destinataire"): DefinitionAssignment {
  return { key: newKey("d", taken, random), label };
}

export function newForm(taken: Set<string>, random: Random = Math.random): DefinitionForm {
  return {
    key: newKey("f", taken, random),
    title: "Nouveau questionnaire",
    assignments: [newAssignment(taken, random)],
    sections: [newSection(taken, random)],
  };
}

/** Document vierge : un questionnaire, un destinataire, une section, une question. */
export function blankDefinition(random: Random = Math.random): CampaignDefinition {
  const key = newCampaignKey(random);
  const taken = new Set<string>([key]);
  return {
    format: "koinonia.campaign",
    version: 1,
    campaign: { key, title: "Nouvelle campagne" },
    forms: [{ ...newForm(taken, random), title: "Questionnaire" }],
  };
}

// ── Changement de type ─────────────────────────────────────────────────────────────────────────

const COMMON_KEYS = ["code", "label", "help", "examples", "required", "reportCode", "internal"] as const;
const QUALIFIED_TYPES = new Set<ItemType>(["integer", "decimal", "text", "longtext", "yesno", "single", "multiple", "date"]);

/**
 * Change le type d'une question en gardant ce qui reste valable : champs communs, qualificatifs
 * (types scalaires), choix (entre choix unique et multiple, sans « exclusif » en choix unique).
 * Le code ne change pas.
 */
export function changeItemType<T extends DefinitionItem | ScalarItem>(item: T, type: ItemType, taken: Set<string>, random: Random = Math.random): T {
  if (item.type === type) return item;
  const out: Record<string, unknown> = {};
  for (const k of COMMON_KEYS) if ((item as Record<string, unknown>)[k] !== undefined) out[k] = (item as Record<string, unknown>)[k];
  out.type = type;
  const old = item as Partial<Record<string, unknown>> & { type: ItemType };
  if (QUALIFIED_TYPES.has(type) && QUALIFIED_TYPES.has(old.type) && old.qualifiers) out.qualifiers = old.qualifiers;
  if (type === "single" || type === "multiple") {
    const previous = old.type === "single" || old.type === "multiple" ? (old.choices as DefinitionChoice[]) : null;
    out.choices = previous
      ? previous.map((c) => (type === "single" ? { key: c.key, label: c.label } : c))
      : newChoices(taken, random);
  }
  if ((type === "integer" || type === "decimal") && (old.type === "integer" || old.type === "decimal")) {
    if (old.min !== undefined) out.min = type === "integer" ? Math.trunc(old.min as number) : old.min;
    if (old.max !== undefined) out.max = type === "integer" ? Math.trunc(old.max as number) : old.max;
  }
  if (type === "group") out.fields = [{ ...newScalarItem("text", taken, random), label: "Nouveau champ" }];
  return out as T;
}

// ── Duplication (nouveaux identifiants) ────────────────────────────────────────────────────────

function freshChoices(choices: readonly DefinitionChoice[], taken: Set<string>, random: Random) {
  return choices.map((c) => ({ ...c, key: newKey("c", taken, random) }));
}

/** Copie d'une question : nouveau code (sous-champs et choix compris), sans code de restitution. */
export function cloneItem<T extends DefinitionItem | ScalarItem>(item: T, taken: Set<string>, random: Random = Math.random): T {
  const copy = { ...item, code: newCode(taken, random) } as Record<string, unknown> & DefinitionItem;
  delete (copy as { reportCode?: string }).reportCode;
  if (copy.type === "single" || copy.type === "multiple") copy.choices = freshChoices(copy.choices, taken, random);
  if (copy.type === "group") copy.fields = copy.fields.map((f) => cloneItem(f, taken, random));
  return copy as T;
}

export function cloneSection(section: DefinitionSection, taken: Set<string>, random: Random = Math.random): DefinitionSection {
  return { ...section, key: newKey("s", taken, random), items: section.items.map((i) => cloneItem(i, taken, random)) };
}

export function cloneForm(form: DefinitionForm, taken: Set<string>, random: Random = Math.random): DefinitionForm {
  return {
    ...form,
    key: newKey("f", taken, random),
    assignments: form.assignments.map((a) => ({ ...a, key: newKey("d", taken, random) })),
    sections: form.sections.map((s) => cloneSection(s, taken, random)),
  };
}

const copyLabel = (label: string, max: number) => `${label} (copie)`.slice(0, max);

// ── Opérations sur le document ─────────────────────────────────────────────────────────────────

type Def = CampaignDefinition;

export function updateForm(def: Def, fi: number, fn: (f: DefinitionForm) => DefinitionForm): Def {
  return { ...def, forms: replaceAt(def.forms, fi, fn(def.forms[fi])) };
}

export function updateSection(def: Def, fi: number, si: number, fn: (s: DefinitionSection) => DefinitionSection): Def {
  return updateForm(def, fi, (f) => ({ ...f, sections: replaceAt(f.sections, si, fn(f.sections[si])) }));
}

export function updateItem(def: Def, fi: number, si: number, ii: number, fn: (i: DefinitionItem) => DefinitionItem): Def {
  return updateSection(def, fi, si, (s) => ({ ...s, items: replaceAt(s.items, ii, fn(s.items[ii])) }));
}

export function addForm(def: Def, random: Random = Math.random): Def {
  return { ...def, forms: [...def.forms, newForm(collectIds(def), random)] };
}

export function duplicateForm(def: Def, fi: number, random: Random = Math.random): Def {
  const copy = cloneForm(def.forms[fi], collectIds(def), random);
  return { ...def, forms: insertAfter(def.forms, fi, { ...copy, title: copyLabel(copy.title, 150) }) };
}

export const removeForm = (def: Def, fi: number): Def => ({ ...def, forms: removeAt(def.forms, fi) });
export const moveForm = (def: Def, fi: number, delta: number): Def => ({ ...def, forms: move(def.forms, fi, delta) });

export function addAssignment(def: Def, fi: number, random: Random = Math.random): Def {
  const a = newAssignment(collectIds(def), random);
  return updateForm(def, fi, (f) => ({ ...f, assignments: [...f.assignments, a] }));
}

export const removeAssignment = (def: Def, fi: number, ai: number): Def =>
  updateForm(def, fi, (f) => ({ ...f, assignments: removeAt(f.assignments, ai) }));
export const moveAssignment = (def: Def, fi: number, ai: number, delta: number): Def =>
  updateForm(def, fi, (f) => ({ ...f, assignments: move(f.assignments, ai, delta) }));
export const updateAssignment = (def: Def, fi: number, ai: number, fn: (a: DefinitionAssignment) => DefinitionAssignment): Def =>
  updateForm(def, fi, (f) => ({ ...f, assignments: replaceAt(f.assignments, ai, fn(f.assignments[ai])) }));

export function addSection(def: Def, fi: number, random: Random = Math.random): Def {
  const s = newSection(collectIds(def), random);
  return updateForm(def, fi, (f) => ({ ...f, sections: [...f.sections, s] }));
}

export function duplicateSection(def: Def, fi: number, si: number, random: Random = Math.random): Def {
  const copy = cloneSection(def.forms[fi].sections[si], collectIds(def), random);
  return updateForm(def, fi, (f) => ({ ...f, sections: insertAfter(f.sections, si, { ...copy, title: copyLabel(copy.title, 150) }) }));
}

export const removeSection = (def: Def, fi: number, si: number): Def =>
  updateForm(def, fi, (f) => ({ ...f, sections: removeAt(f.sections, si) }));
export const moveSection = (def: Def, fi: number, si: number, delta: number): Def =>
  updateForm(def, fi, (f) => ({ ...f, sections: move(f.sections, si, delta) }));

export function addItem(def: Def, fi: number, si: number, type: ItemType = "integer", random: Random = Math.random): Def {
  const item = newItem(type, collectIds(def), random);
  return updateSection(def, fi, si, (s) => ({ ...s, items: [...s.items, item] }));
}

export function duplicateItem(def: Def, fi: number, si: number, ii: number, random: Random = Math.random): Def {
  const copy = cloneItem(def.forms[fi].sections[si].items[ii], collectIds(def), random);
  return updateSection(def, fi, si, (s) => ({ ...s, items: insertAfter(s.items, ii, { ...copy, label: copyLabel(copy.label, 300) }) }));
}

export const removeItem = (def: Def, fi: number, si: number, ii: number): Def =>
  updateSection(def, fi, si, (s) => ({ ...s, items: removeAt(s.items, ii) }));
export const moveItem = (def: Def, fi: number, si: number, ii: number, delta: number): Def =>
  updateSection(def, fi, si, (s) => ({ ...s, items: move(s.items, ii, delta) }));

/** Déplace une question à la fin d'une autre section du même questionnaire (son code ne change pas). */
export function moveItemToSection(def: Def, fi: number, si: number, ii: number, toSi: number): Def {
  if (si === toSi) return def;
  const item = def.forms[fi].sections[si].items[ii];
  return updateForm(def, fi, (f) => ({
    ...f,
    sections: f.sections.map((s, i) =>
      i === si ? { ...s, items: removeAt(s.items, ii) } : i === toSi ? { ...s, items: [...s.items, item] } : s
    ),
  }));
}

// ── Sous-champs d'un groupe, choix ─────────────────────────────────────────────────────────────

export function addGroupField(item: DefinitionItem, taken: Set<string>, random: Random = Math.random): DefinitionItem {
  if (item.type !== "group") return item;
  return { ...item, fields: [...item.fields, { ...newScalarItem("text", taken, random), label: "Nouveau champ" }] };
}

export function addChoice<T extends DefinitionItem | ScalarItem>(item: T, taken: Set<string>, random: Random = Math.random): T {
  if (item.type !== "single" && item.type !== "multiple") return item;
  return { ...item, choices: [...item.choices, { key: newKey("c", taken, random), label: `Choix ${item.choices.length + 1}` }] };
}

// ── Contrôles : forme simple ⇄ RuleCheck ───────────────────────────────────────────────────────

export type SimpleOperand = { kind: "code"; code: string } | { kind: "value"; value: number | boolean };
export interface SimpleComparison {
  op: Comparator;
  left: SimpleOperand;
  right: SimpleOperand;
}
export type SimpleRule = { kind: "compare"; compare: SimpleComparison } | { kind: "implies"; when: SimpleComparison; then: SimpleComparison };

export const COMPARATOR_LABELS: Record<Comparator, string> = {
  lte: "≤ inférieur ou égal à",
  lt: "< inférieur à",
  gte: "≥ supérieur ou égal à",
  gt: "> supérieur à",
  eq: "= égal à",
  neq: "≠ différent de",
};

const COMPARATOR_SET = new Set<string>(["lte", "lt", "gte", "gt", "eq", "neq"]);

function toSimpleOperand(o: Operand): SimpleOperand | null {
  if (typeof o === "string") return { kind: "code", code: o };
  if (typeof o === "number" || typeof o === "boolean") return { kind: "value", value: o };
  return null;
}

function toSimpleComparison(check: RuleCheck): SimpleComparison | null {
  const entries = Object.entries(check);
  if (entries.length !== 1) return null;
  const [op, pair] = entries[0];
  if (!COMPARATOR_SET.has(op) || !Array.isArray(pair) || pair.length !== 2) return null;
  const left = toSimpleOperand(pair[0] as Operand);
  const right = toSimpleOperand(pair[1] as Operand);
  return left && right ? { op: op as Comparator, left, right } : null;
}

/** Forme simple d'un contrôle (comparaison, ou « si … alors … » de deux comparaisons) ; `null` : JSON. */
export function toSimpleRule(check: RuleCheck): SimpleRule | null {
  if ("implies" in check) {
    const when = toSimpleComparison(check.implies[0]);
    const then = toSimpleComparison(check.implies[1]);
    return when && then ? { kind: "implies", when, then } : null;
  }
  const compare = toSimpleComparison(check);
  return compare ? { kind: "compare", compare } : null;
}

const fromSimpleOperand = (o: SimpleOperand): Operand => (o.kind === "code" ? o.code : o.value);

export function fromSimpleComparison(c: SimpleComparison): RuleCheck {
  return { [c.op]: [fromSimpleOperand(c.left), fromSimpleOperand(c.right)] } as RuleCheck;
}

export function fromSimpleRule(rule: SimpleRule): RuleCheck {
  if (rule.kind === "implies") return { implies: [fromSimpleComparison(rule.when), fromSimpleComparison(rule.then)] };
  return fromSimpleComparison(rule.compare);
}

/** Questions utilisables dans un contrôle : nombres et oui/non de premier niveau, dans l'ordre. */
export function ruleCandidates(def: Def): { code: string; label: string; type: ItemType; form: string }[] {
  return def.forms.flatMap((f) =>
    f.sections.flatMap((s) =>
      s.items
        .filter((i) => i.type === "integer" || i.type === "decimal" || i.type === "yesno")
        .map((i) => ({ code: i.code, label: i.label, type: i.type, form: f.title }))
    )
  );
}

/** Nouveau contrôle simple : première question numérique ≤ 0 (à régler). */
export function addRule(def: Def, random: Random = Math.random): Def {
  const first = ruleCandidates(def).find((c) => c.type !== "yesno");
  const rule: Rule = {
    key: newKey("r", collectIds(def), random),
    message: "Valeur à vérifier",
    check: { lte: [first?.code ?? 0, 0] },
  };
  return { ...def, rules: [...(def.rules ?? []), rule] };
}

export function updateRule(def: Def, ri: number, fn: (r: Rule) => Rule): Def {
  return { ...def, rules: replaceAt(def.rules ?? [], ri, fn((def.rules ?? [])[ri])) };
}

export function removeRule(def: Def, ri: number): Def {
  const rules = removeAt(def.rules ?? [], ri);
  const out: Def = { ...def, rules };
  if (rules.length === 0) delete out.rules;
  return out;
}

// ── Validation ─────────────────────────────────────────────────────────────────────────────────

/** Élément du document auquel une erreur se rattache. */
export type Target =
  | { kind: "campaign" }
  | { kind: "form"; fi: number }
  | { kind: "assignment"; fi: number; ai: number }
  | { kind: "section"; fi: number; si: number }
  | { kind: "item"; fi: number; si: number; ii: number }
  | { kind: "rule"; ri: number }
  | { kind: "global" };

export interface EditorIssue {
  target: Target;
  message: string;
}

/** Clé d'un élément, pour rattacher les erreurs à l'écran. */
export function targetId(t: Target): string {
  switch (t.kind) {
    case "form":
      return `form:${t.fi}`;
    case "assignment":
      return `assignment:${t.fi}:${t.ai}`;
    case "section":
      return `section:${t.fi}:${t.si}`;
    case "item":
      return `item:${t.fi}:${t.si}:${t.ii}`;
    case "rule":
      return `rule:${t.ri}`;
    default:
      return t.kind;
  }
}

const FIELD_NAMES: Record<string, string> = {
  title: "Titre",
  label: "Libellé",
  description: "Description",
  intro: "Consignes",
  help: "Aide",
  examples: "Exemples",
  message: "Message",
  min: "Minimum",
  max: "Maximum",
  decimals: "Décimales",
  unit: "Unité",
  maxLength: "Longueur maximale",
  minRows: "Lignes minimum",
  maxRows: "Lignes maximum",
  noneLabel: "Libellé « aucune »",
  maxFiles: "Nombre de fichiers",
  accept: "Formats",
  choices: "Choix",
  fields: "Champs",
  items: "Questions",
  sections: "Sections",
  assignments: "Destinataires",
  forms: "Questionnaires",
  dueAt: "Échéance",
  periodStart: "Début de période",
  periodEnd: "Fin de période",
  fileRetentionDays: "Conservation des fichiers",
  reportCode: "Code de restitution",
  check: "Contrôle",
  messages: "Messages",
};

type Issue = { code: string; path: PropertyKey[]; message: string; minimum?: unknown; maximum?: unknown; origin?: string };

function issueText(issue: Issue): string {
  const field = [...issue.path].reverse().find((p): p is string => typeof p === "string" && p in FIELD_NAMES);
  const name = field ? FIELD_NAMES[field] : null;
  let text = issue.message;
  if (issue.code === "too_small") {
    text =
      issue.origin === "string"
        ? Number(issue.minimum) <= 1
          ? "obligatoire"
          : `${issue.minimum} caractères au moins`
        : issue.origin === "array"
          ? `${issue.minimum} au moins`
          : `minimum ${issue.minimum}`;
  } else if (issue.code === "too_big") {
    text = issue.origin === "string" ? `${issue.maximum} caractères au plus` : issue.origin === "array" ? `${issue.maximum} au plus` : `maximum ${issue.maximum}`;
  } else if (issue.code === "invalid_type") {
    text = "valeur invalide";
  } else if (issue.code === "invalid_union" && field === "check") {
    text = "forme de contrôle non reconnue";
  }
  return name ? `${name} : ${text}` : text;
}

/** Élément visé par un chemin Zod (`forms.0.sections.1.items.2.label` → question). */
export function targetOfPath(path: readonly PropertyKey[]): Target {
  const at = (i: number) => (typeof path[i] === "number" ? (path[i] as number) : -1);
  if (path[0] === "campaign") return { kind: "campaign" };
  if (path[0] === "rules" && at(1) >= 0) return { kind: "rule", ri: at(1) };
  if (path[0] === "forms" && at(1) >= 0) {
    const fi = at(1);
    if (path[2] === "assignments" && at(3) >= 0) return { kind: "assignment", fi, ai: at(3) };
    if (path[2] === "sections" && at(3) >= 0) {
      const si = at(3);
      if (path[4] === "items" && at(5) >= 0) return { kind: "item", fi, si, ii: at(5) };
      return { kind: "section", fi, si };
    }
    return { kind: "form", fi };
  }
  return { kind: "global" };
}

/**
 * Élément visé par une erreur sémantique (`validateDefinition`) : elle cite le questionnaire
 * (« Questionnaire « clé » »), la règle (« Règle « clé » ») et le code de la question concernée.
 */
export function targetOfMessage(def: Def, message: string): Target {
  const rule = /^Règle « ([^»]+) »/.exec(message);
  if (rule) {
    const ri = (def.rules ?? []).findIndex((r) => r.key === rule[1].trim());
    return ri >= 0 ? { kind: "rule", ri } : { kind: "global" };
  }
  if (message.startsWith("Campagne")) return { kind: "campaign" };
  const form = /^Questionnaire « ([^»]+) »(?:, ([A-Za-z][A-Za-z0-9_]*))?/.exec(message);
  if (!form) return { kind: "global" };
  const fi = def.forms.findIndex((f) => f.key === form[1].trim());
  if (fi < 0) return { kind: "global" };
  const code = form[2];
  if (code) {
    const sections = def.forms[fi].sections;
    for (let si = 0; si < sections.length; si++) {
      const ii = sections[si].items.findIndex((i) => i.code === code);
      if (ii >= 0) return { kind: "item", fi, si, ii };
    }
  }
  const section = /section « ([^»]+) »/.exec(message);
  if (section) {
    const si = def.forms[fi].sections.findIndex((s) => s.key === section[1].trim());
    if (si >= 0) return { kind: "section", fi, si };
  }
  const assignment = /destinataire « ([^»]+) »/.exec(message);
  if (assignment) {
    const ai = def.forms[fi].assignments.findIndex((a) => a.key === assignment[1].trim());
    if (ai >= 0) return { kind: "assignment", fi, ai };
  }
  return { kind: "form", fi };
}

/** Validation complète du document (schéma puis contrôles sémantiques), erreurs rattachées. */
export function validateEditor(def: Def): EditorIssue[] {
  const parsed = campaignDefinitionSchema.safeParse(def);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({ target: targetOfPath(issue.path), message: issueText(issue as unknown as Issue) }));
  }
  return validateDefinition(parsed.data).map((message) => ({ target: targetOfMessage(def, message), message }));
}

/** Erreurs groupées par élément (`targetId`). */
export function issuesByTarget(issues: readonly EditorIssue[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { target, message } of issues) {
    const id = targetId(target);
    out.set(id, [...(out.get(id) ?? []), message]);
  }
  return out;
}

/** Emplacement lisible d'une erreur pour la liste globale. */
export function describeTarget(def: Def, t: Target): string {
  const form = (fi: number) => def.forms[fi]?.title || `Questionnaire ${fi + 1}`;
  switch (t.kind) {
    case "campaign":
      return "Paramètres généraux";
    case "form":
      return form(t.fi);
    case "assignment":
      return `${form(t.fi)} › destinataire ${t.ai + 1}`;
    case "section":
      return `${form(t.fi)} › ${def.forms[t.fi]?.sections[t.si]?.title || `section ${t.si + 1}`}`;
    case "item": {
      const s = def.forms[t.fi]?.sections[t.si];
      return `${form(t.fi)} › ${s?.title || `section ${t.si + 1}`} › ${s?.items[t.ii]?.label || `question ${t.ii + 1}`}`;
    }
    case "rule":
      return `Contrôle ${t.ri + 1}`;
    default:
      return "Document";
  }
}

/** Document comparable (détection des modifications non enregistrées). */
export const snapshot = (def: Def) => JSON.stringify(def);
