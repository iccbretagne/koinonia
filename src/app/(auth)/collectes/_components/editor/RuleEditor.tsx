"use client";

import { useEffect, useState } from "react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { COMPARATORS, ruleCheckSchema, type Comparator, type Rule, type RuleCheck } from "@/modules/campaigns/schemas";
import { COMPARATOR_LABELS, fromSimpleRule, toSimpleRule, type SimpleComparison, type SimpleOperand, type SimpleRule } from "./state";
import { NumberField } from "./fields";

/**
 * Contrôle de cohérence (spec 091, EVOL-11) : éditeur simple (question ou valeur, opérateur,
 * question ou valeur ; ou « si … alors … ») quand la règle s'y prête, sinon JSON validé par
 * `ruleCheckSchema`. Les contrôles ne bloquent jamais la saisie.
 */

export interface RuleCandidate {
  code: string;
  label: string;
  form: string;
}

const NUMBER = "__nombre";
const YES = "__oui";
const NO = "__non";

function operandValue(o: SimpleOperand): string {
  if (o.kind === "code") return o.code;
  if (typeof o.value === "boolean") return o.value ? YES : NO;
  return NUMBER;
}

function OperandPicker({
  label,
  operand,
  candidates,
  onChange,
  onInvalid,
}: {
  readonly label: string;
  readonly operand: SimpleOperand;
  readonly candidates: readonly RuleCandidate[];
  readonly onChange: (o: SimpleOperand) => void;
  readonly onInvalid: (invalid: boolean) => void;
}) {
  const value = operandValue(operand);
  const known = operand.kind !== "code" || candidates.some((c) => c.code === operand.code);
  const options = [
    ...candidates.map((c) => ({ value: c.code, label: `${c.label} (${c.form})` })),
    ...(known ? [] : [{ value, label: `Question inconnue (${value})` }]),
    { value: NUMBER, label: "Valeur numérique…" },
    { value: YES, label: "Oui" },
    { value: NO, label: "Non" },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Select
        label={label}
        value={value}
        options={options}
        onChange={(e) => {
          const v = e.target.value;
          if (v === NUMBER) onChange({ kind: "value", value: 0 });
          else if (v === YES || v === NO) onChange({ kind: "value", value: v === YES });
          else onChange({ kind: "code", code: v });
        }}
      />
      {operand.kind === "value" && typeof operand.value === "number" && (
        <NumberField
          label="Valeur"
          value={operand.value}
          onInvalid={onInvalid}
          onChange={(v) => onChange({ kind: "value", value: v ?? 0 })}
        />
      )}
    </div>
  );
}

function ComparisonEditor({
  comparison,
  candidates,
  onChange,
  onInvalid,
}: {
  readonly comparison: SimpleComparison;
  readonly candidates: readonly RuleCandidate[];
  readonly onChange: (c: SimpleComparison) => void;
  readonly onInvalid: (invalid: boolean) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_12rem_1fr]">
      <OperandPicker label="Valeur de" operand={comparison.left} candidates={candidates} onInvalid={onInvalid} onChange={(left) => onChange({ ...comparison, left })} />
      <Select
        label="Doit être"
        value={comparison.op}
        options={COMPARATORS.map((op) => ({ value: op, label: COMPARATOR_LABELS[op] }))}
        onChange={(e) => onChange({ ...comparison, op: e.target.value as Comparator })}
      />
      <OperandPicker label="Comparé à" operand={comparison.right} candidates={candidates} onInvalid={onInvalid} onChange={(right) => onChange({ ...comparison, right })} />
    </div>
  );
}

/** Saisie JSON d'un contrôle : appliquée seulement quand elle est valide. */
function JsonCheck({
  check,
  onChange,
  onInvalid,
}: {
  readonly check: RuleCheck;
  readonly onChange: (c: RuleCheck) => void;
  readonly onInvalid: (invalid: boolean) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(check, null, 2));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    onInvalid(true);
    return () => onInvalid(false);
  }, [error, onInvalid]);
  return (
    <Textarea
      label="Contrôle (JSON)"
      rows={6}
      spellCheck={false}
      className="font-mono text-[13px]"
      value={text}
      error={error ?? undefined}
      hint="Formes : lte, lt, gte, gt, eq, neq (deux opérandes), chain_gte, chain_lte (codes), implies, all ; opérande : code, nombre, oui/non (true/false) ou { sum: [...] }."
      onChange={(e) => {
        setText(e.target.value);
        let parsed: unknown;
        try {
          parsed = JSON.parse(e.target.value);
        } catch {
          return setError("JSON illisible");
        }
        const result = ruleCheckSchema.safeParse(parsed);
        if (!result.success) return setError("Forme de contrôle non reconnue");
        setError(null);
        onChange(result.data);
      }}
    />
  );
}

export default function RuleEditor({
  rule,
  candidates,
  onChange,
  onInvalid,
}: {
  readonly rule: Rule;
  readonly candidates: readonly RuleCandidate[];
  readonly onChange: (r: Rule) => void;
  readonly onInvalid: (invalid: boolean) => void;
}) {
  const simple = toSimpleRule(rule.check);
  const [json, setJson] = useState(simple === null);
  const setSimple = (s: SimpleRule) => onChange({ ...rule, check: fromSimpleRule(s) });

  return (
    <div className="flex flex-col gap-3">
      <Input
        label="Message affiché si le contrôle n'est pas respecté"
        maxLength={500}
        value={rule.message}
        onChange={(e) => onChange({ ...rule, message: e.target.value })}
      />
      {json || !simple ? (
        <>
          <JsonCheck check={rule.check} onChange={(check) => onChange({ ...rule, check })} onInvalid={onInvalid} />
          {simple && (
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setJson(false)}>
              Revenir à l&apos;éditeur simple
            </Button>
          )}
        </>
      ) : (
        <>
          <Select
            label="Forme"
            value={simple.kind}
            options={[
              { value: "compare", label: "Comparaison" },
              { value: "implies", label: "Si … alors …" },
            ]}
            onChange={(e) =>
              setSimple(
                e.target.value === "implies" && simple.kind === "compare"
                  ? { kind: "implies", when: simple.compare, then: simple.compare }
                  : simple.kind === "implies"
                    ? { kind: "compare", compare: simple.then }
                    : simple
              )
            }
          />
          {simple.kind === "compare" ? (
            <ComparisonEditor comparison={simple.compare} candidates={candidates} onInvalid={onInvalid} onChange={(compare) => setSimple({ kind: "compare", compare })} />
          ) : (
            <>
              <p className="text-[13px] font-semibold text-ink">Si</p>
              <ComparisonEditor comparison={simple.when} candidates={candidates} onInvalid={onInvalid} onChange={(when) => setSimple({ ...simple, when })} />
              <p className="text-[13px] font-semibold text-ink">Alors</p>
              <ComparisonEditor comparison={simple.then} candidates={candidates} onInvalid={onInvalid} onChange={(then) => setSimple({ ...simple, then })} />
            </>
          )}
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setJson(true)}>
            Modifier en JSON
          </Button>
        </>
      )}
    </div>
  );
}
