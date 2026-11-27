import type { Operand, Qualifier, Rule, RuleCheck } from "../schemas";

/**
 * Contrôles de cohérence déclaratifs (spec 090) : arbre JSON évalué sur les réponses, jamais
 * bloquant. `skipped` dès qu'une valeur manque ou n'est pas exploitable (sans objet, NSP, type
 * non numérique ni booléen) : on n'alerte que sur ce qui est réellement comparable.
 */

export type RuleResult = "ok" | "violated" | "skipped";

export interface RuleValue {
  value: unknown;
  qualifier: Qualifier;
}

export type RuleValues = ReadonlyMap<string, RuleValue>;

export interface RuleEvaluation {
  key: string;
  message: string;
  result: RuleResult;
  /** Valeurs des codes de la règle (nulles si absentes), pour l'affichage. */
  values: Record<string, unknown>;
}

type Resolved = number | boolean | null;

const EPSILON = 1e-9;

function resolve(operand: Operand, values: RuleValues): Resolved {
  if (typeof operand === "number" || typeof operand === "boolean") return operand;
  if (typeof operand === "string") {
    const answer = values.get(operand);
    if (!answer || answer.qualifier === "NOT_APPLICABLE" || answer.qualifier === "NSP") return null;
    const v = answer.value;
    return typeof v === "number" && Number.isFinite(v) ? v : typeof v === "boolean" ? v : null;
  }
  let total = 0;
  for (const part of operand.sum) {
    const v = resolve(part, values);
    if (typeof v !== "number") return null;
    total += v;
  }
  return total;
}

function compare(op: string, a: Resolved, b: Resolved): RuleResult {
  if (a === null || b === null) return "skipped";
  if (op === "eq" || op === "neq") {
    if (typeof a !== typeof b) return "skipped";
    const equal = typeof a === "number" ? Math.abs(a - (b as number)) < EPSILON : a === b;
    return equal === (op === "eq") ? "ok" : "violated";
  }
  if (typeof a !== "number" || typeof b !== "number") return "skipped";
  const holds =
    op === "lte" ? a <= b + EPSILON : op === "lt" ? a < b - EPSILON : op === "gte" ? a >= b - EPSILON : a > b + EPSILON;
  return holds ? "ok" : "violated";
}

function chain(codes: readonly string[], values: RuleValues, op: "gte" | "lte"): RuleResult {
  const resolved = codes.map((c) => resolve(c, values));
  if (resolved.some((v) => typeof v !== "number")) return "skipped";
  for (let i = 1; i < resolved.length; i++) {
    if (compare(op, resolved[i - 1], resolved[i]) === "violated") return "violated";
  }
  return "ok";
}

export function evaluateCheck(check: RuleCheck, values: RuleValues): RuleResult {
  if ("chain_gte" in check) return chain(check.chain_gte, values, "gte");
  if ("chain_lte" in check) return chain(check.chain_lte, values, "lte");
  if ("implies" in check) {
    const premise = evaluateCheck(check.implies[0], values);
    if (premise === "skipped") return "skipped";
    if (premise === "violated") return "ok";
    return evaluateCheck(check.implies[1], values);
  }
  if ("all" in check) {
    const results = check.all.map((c) => evaluateCheck(c, values));
    return results.includes("violated") ? "violated" : results.includes("skipped") ? "skipped" : "ok";
  }
  const [op, [a, b]] = Object.entries(check)[0] as [string, [Operand, Operand]];
  return compare(op, resolve(a, values), resolve(b, values));
}

function operandCodes(operand: Operand, out: string[]) {
  if (typeof operand === "string") out.push(operand);
  else if (typeof operand === "object") operand.sum.forEach((o) => operandCodes(o, out));
}

function checkCodes(check: RuleCheck, out: string[]) {
  if ("chain_gte" in check) out.push(...check.chain_gte);
  else if ("chain_lte" in check) out.push(...check.chain_lte);
  else if ("implies" in check) check.implies.forEach((c) => checkCodes(c, out));
  else if ("all" in check) check.all.forEach((c) => checkCodes(c, out));
  else (Object.values(check)[0] as [Operand, Operand]).forEach((o) => operandCodes(o, out));
}

/** Codes cités par une règle, sans doublon, dans l'ordre d'apparition. */
export function ruleCodes(rule: Pick<Rule, "check">): string[] {
  const out: string[] = [];
  checkCodes(rule.check, out);
  return [...new Set(out)];
}

export function evaluateRules(rules: readonly Rule[], values: RuleValues): RuleEvaluation[] {
  return rules.map((rule) => ({
    key: rule.key,
    message: rule.message,
    result: evaluateCheck(rule.check, values),
    values: Object.fromEntries(ruleCodes(rule).map((c) => [c, values.get(c)?.value ?? null])),
  }));
}

/**
 * Portée d'une règle : locale si tous ses codes sont dans le même questionnaire (alerte pendant
 * la saisie), croisée sinon (onglet Contrôles du pilotage).
 */
export function ruleScope(rule: Pick<Rule, "check">, formKeyByCode: ReadonlyMap<string, string>): { local: string } | "cross" {
  const forms = new Set(ruleCodes(rule).map((c) => formKeyByCode.get(c)));
  if (forms.size !== 1) return "cross";
  const [formKey] = forms;
  return formKey === undefined ? "cross" : { local: formKey };
}
