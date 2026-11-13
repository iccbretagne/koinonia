"use client";

import { useId, type ReactNode } from "react";
import { Checkbox, Input, Select, Textarea } from "@/components/ui";
import { fieldLabelClasses } from "@/components/ui";
import { visibleQuestionIds } from "@/modules/forms/schemas";
import type { Answers, FillerChoice, FillerQuestion, FillerForm } from "./types";

/**
 * Remplissage d'un formulaire (spec 079) : page publique, page « Gérer ma réponse », aperçu de la
 * construction. Les questions conditionnelles apparaissent selon les réponses précédentes, avec
 * la même règle que le serveur (`visibleQuestionIds`), qui revalide tout à l'envoi.
 */

function bounds(config: unknown): { min?: number; max?: number } {
  if (!config || typeof config !== "object") return {};
  const { min, max } = config as { min?: number; max?: number };
  return { min, max };
}

function choiceLabel(c: FillerChoice, waitlist: boolean) {
  if (c.remaining === null) return c.label;
  if (c.remaining > 0) return `${c.label} (${c.remaining} place${c.remaining > 1 ? "s" : ""})`;
  return `${c.label} (complet${waitlist ? " — liste d'attente" : ""})`;
}

const required = (q: FillerQuestion) => (q.required ? " *" : "");

function Question({
  q,
  value,
  onChange,
  waitlist,
  disabled,
}: {
  readonly q: FillerQuestion;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly waitlist: boolean;
  readonly disabled: boolean;
}) {
  const id = useId();
  const label = `${q.label}${required(q)}`;
  const hint = q.help ?? undefined;
  const isFull = (c: FillerChoice) => c.remaining === 0 && !waitlist;

  switch (q.type) {
    case "SHORT_TEXT":
    case "EMAIL":
    case "PHONE":
    case "DATE":
      return (
        <Input
          id={id}
          label={label}
          hint={hint}
          type={q.type === "EMAIL" ? "email" : q.type === "PHONE" ? "tel" : q.type === "DATE" ? "date" : "text"}
          autoComplete={q.type === "EMAIL" ? "email" : q.type === "PHONE" ? "tel" : undefined}
          value={typeof value === "string" ? value : ""}
          maxLength={q.type === "SHORT_TEXT" ? 300 : undefined}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "LONG_TEXT":
      return (
        <Textarea
          id={id}
          label={label}
          hint={hint}
          rows={4}
          maxLength={5000}
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "NUMBER": {
      const { min, max } = bounds(q.config);
      return (
        <Input
          id={id}
          label={label}
          hint={hint ?? (min !== undefined && max !== undefined ? `De ${min} à ${max}` : undefined)}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={typeof value === "number" ? String(value) : typeof value === "string" ? value : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );
    }
    case "DROPDOWN":
      return (
        <Select
          id={id}
          label={label}
          hint={hint}
          placeholder="Choisir…"
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          options={q.choices.filter((c) => !isFull(c) || c.id === value).map((c) => ({ value: c.id, label: choiceLabel(c, waitlist) }))}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE":
    case "YES_NO":
    case "RATING": {
      const multiple = q.type === "MULTIPLE_CHOICE";
      const options: { key: string; value: unknown; label: string; full: boolean }[] =
        q.type === "YES_NO"
          ? [
              { key: "true", value: true, label: "Oui", full: false },
              { key: "false", value: false, label: "Non", full: false },
            ]
          : q.type === "RATING"
            ? [1, 2, 3, 4, 5].map((n) => ({ key: String(n), value: n, label: String(n), full: false }))
            : q.choices.map((c) => ({ key: c.id, value: c.id, label: choiceLabel(c, waitlist), full: isFull(c) }));
      const selected = (v: unknown) => (multiple ? Array.isArray(value) && value.includes(v) : value === v);
      return (
        <fieldset className="flex flex-col gap-1.5">
          <legend className={fieldLabelClasses}>{label}</legend>
          {hint && <p className="text-[13px] text-ink-muted">{hint}</p>}
          <div className={q.type === "RATING" ? "flex gap-2" : "flex flex-col"}>
            {options.map((o) => (
              <label
                key={o.key}
                className={`flex min-h-11 items-center gap-3 ${q.type === "RATING" ? "justify-center rounded-control border border-line px-4" : ""} ${o.full && !selected(o.value) ? "opacity-50" : "cursor-pointer"}`}
              >
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name={id}
                  className="size-5 accent-brand"
                  checked={selected(o.value)}
                  disabled={disabled || (o.full && !selected(o.value))}
                  onChange={(e) => {
                    if (!multiple) return onChange(o.value);
                    const current = Array.isArray(value) ? (value as unknown[]) : [];
                    onChange(e.target.checked ? [...current, o.value] : current.filter((v) => v !== o.value));
                  }}
                />
                <span className="text-[15px] text-ink">{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case "CONSENT":
      return (
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <Checkbox className="mt-0.5" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          <span className="text-[15px] text-ink">
            {label}
            {hint && <span className="mt-1 block text-[13px] text-ink-muted">{hint}</span>}
          </span>
        </label>
      );
    case "SESSION_LEVEL":
      return null;
  }
}

export default function FormFiller({
  form,
  answers,
  onChange,
  disabled = false,
  children,
}: {
  readonly form: FillerForm;
  readonly answers: Answers;
  readonly onChange: (answers: Answers) => void;
  readonly disabled?: boolean;
  readonly children?: ReactNode;
}) {
  const visible = visibleQuestionIds(form.questions, answers);
  return (
    <div className="space-y-5">
      {form.questions
        .filter((q) => visible.has(q.id))
        .map((q) => (
          <Question
            key={q.id}
            q={q}
            value={answers[q.id]}
            waitlist={form.waitlistEnabled}
            disabled={disabled}
            onChange={(v) => onChange({ ...answers, [q.id]: v })}
          />
        ))}
      {children}
    </div>
  );
}

/** Ne garde que les réponses des questions visibles (une question masquée est ignorée). */
export function visibleAnswers(form: FillerForm, answers: Answers): Answers {
  const visible = visibleQuestionIds(form.questions, answers);
  return Object.fromEntries(Object.entries(answers).filter(([id, v]) => visible.has(id) && v !== undefined && v !== ""));
}
