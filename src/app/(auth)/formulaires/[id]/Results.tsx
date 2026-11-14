"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FormResults, QuestionResult } from "@/modules/forms";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** Barres horizontales : une par réponse possible, effectif et part des répondants. */
function Bars({ rows, answered }: { readonly rows: { label: string; count: number }[]; readonly answered: number }) {
  const data = rows.map((r) => ({ ...r, text: `${r.count} · ${pct(r.count, answered)} %` }));
  return (
    <div style={{ height: Math.max(80, data.length * 40) }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 80, bottom: 0, left: 0 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={160} tick={{ fontSize: 13, fill: "var(--ink-muted)" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "var(--surface-sunken)" }} formatter={(v) => [String(v), "Réponses"]} />
          <Bar dataKey="count" fill="var(--brand)" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="text" position="right" style={{ fontSize: 13, fill: "var(--ink)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Question({ q }: { readonly q: QuestionResult }) {
  const head = (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="font-semibold text-ink">{q.label}</h3>
      <p className="shrink-0 text-[13px] text-ink-muted">
        {q.answered} réponse{q.answered > 1 ? "s" : ""}
      </p>
    </div>
  );
  return (
    <li className="space-y-3 rounded-card border border-line bg-surface p-4">
      {head}
      {q.answered === 0 ? (
        <p className="text-[14px] text-ink-muted">Pas encore de réponse.</p>
      ) : q.kind === "choices" ? (
        <>
          <Bars rows={q.items.map((i) => ({ label: i.label, count: i.count }))} answered={q.answered} />
          {q.items.some((i) => i.capacity != null) && (
            <p className="text-[13px] text-ink-muted">
              {q.items
                .filter((i) => i.capacity != null)
                .map((i) => `${i.label} : ${i.count} / ${i.capacity}`)
                .join(" · ")}
            </p>
          )}
        </>
      ) : q.kind === "rating" ? (
        <>
          <p className="text-[15px] text-ink">
            Moyenne : <span className="font-semibold">{q.average?.toLocaleString("fr-FR")} / 5</span>
          </p>
          <Bars rows={q.distribution.map((count, i) => ({ label: `${i + 1} / 5`, count }))} answered={q.answered} />
        </>
      ) : q.kind === "number" ? (
        <p className="text-[15px] text-ink">
          Total <span className="font-semibold">{q.sum.toLocaleString("fr-FR")}</span> · moyenne {q.average?.toLocaleString("fr-FR")} · de {q.min} à {q.max}
        </p>
      ) : q.kind === "texts" ? (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {q.texts.map((t, i) => (
            <li key={i} className="rounded-control bg-surface-sunken px-3 py-2 text-[14px] whitespace-pre-line text-ink">
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-ink-muted">Coordonnées : comptées, jamais listées dans les résultats.</p>
      )}
    </li>
  );
}

/** Résultats regroupés (spec 079, lot 3) : aucune identité, sondage anonyme ou non. */
export default function Results({ results, anonymous, manage, formId }: { readonly results: FormResults; readonly anonymous: boolean; readonly manage: boolean; readonly formId: string }) {
  const p = results.participation;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-ink">
          {results.responses} réponse{results.responses > 1 ? "s" : ""} confirmée{results.responses > 1 ? "s" : ""}
          {anonymous ? " · sondage anonyme : aucune identité" : ""}
        </p>
        {manage && (
          <a href={`/api/forms/${formId}/export`} className="text-[15px] font-semibold text-brand-text underline">
            Exporter (.xlsx, avec les résultats)
          </a>
        )}
      </div>
      {p && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Participants", p.total],
            ["Personnes qui viennent", p.attending],
            ["Accompagnants", p.companions],
            ["Ne viennent pas", p.notAttending],
          ].map(([label, value]) => (
            <div key={label} className="rounded-card border border-line bg-surface p-3">
              <dt className="text-[13px] text-ink-muted">{label}</dt>
              <dd className="text-2xl font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <ul className="space-y-3">
        {results.questions.map((q) => (
          <Question key={q.questionId} q={q} />
        ))}
      </ul>
    </div>
  );
}
