"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, MessageCircleQuestion } from "lucide-react";
import {
  Alert,
  Button,
  ConfirmModal,
  EmptyState,
  Input,
  Modal,
  SearchInput,
  Select,
  StatusChip,
  Textarea,
  useToast,
} from "@/components/ui";
import type { AdminEntry, StatsPeriod } from "@/modules/assistant";
import type { EntryInput } from "@/modules/assistant/schemas";

interface PendingRow {
  id: string;
  text: string;
  reason: "UNANSWERED" | "NOT_HELPFUL";
  screen: string | null;
  role: string | null;
  count: number;
  status: string;
  entryKey: string | null;
  lastAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: "À traiter",
  ANSWERED: "Répondues",
  LINKED: "Rattachées",
  OFF_TOPIC: "Hors sujet",
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  SECRETARY: "Secrétaire",
  MINISTER: "Ministre",
  DEPARTMENT_HEAD: "Resp. département",
  DISCIPLE_MAKER: "Faiseur de disciples",
  REPORTER: "Reporter",
  STAR: "STAR",
  PASTORAL_CARE_REFERENT: "Référent soins pastoraux",
  ACCOUNTANT: "Comptable",
};

const ORIGIN_LABEL: Record<AdminEntry["origin"], string> = {
  builtin: "Fournie",
  override: "Corrigée",
  custom: "Ajoutée",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Échec de l'enregistrement");
  }
  return res.json();
}

function audienceLabel(entry: AdminEntry): string {
  const a = entry.audience;
  if (a.all) return "Tous";
  return [
    ...(a.roles ?? []).map((r) => ROLE_LABEL[r] ?? r),
    ...(a.permissions ?? []),
    ...(a.predicates ?? []),
  ].join(", ");
}

// ─── Formulaire de fiche ─────────────────────────────────────────────────────

function EntryForm({
  title,
  initial,
  submitLabel,
  showRoles,
  onSubmit,
  onClose,
}: {
  readonly title: string;
  readonly initial: Partial<EntryInput>;
  readonly submitLabel: string;
  readonly showRoles: boolean;
  readonly onSubmit: (entry: EntryInput) => Promise<void>;
  readonly onClose: () => void;
}) {
  const [entryTitle, setEntryTitle] = useState(initial.title ?? "");
  const [questions, setQuestions] = useState((initial.questions ?? []).join("\n"));
  const [answer, setAnswer] = useState(initial.answer ?? "");
  const [href, setHref] = useState(initial.href ?? "");
  const [hrefLabel, setHrefLabel] = useState(initial.hrefLabel ?? "");
  const [role, setRole] = useState(initial.roles?.[0] ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: entryTitle.trim(),
        questions: questions.split("\n").map((q) => q.trim()).filter(Boolean),
        answer: answer.trim(),
        href: href.trim() || null,
        hrefLabel: hrefLabel.trim() || null,
        roles: showRoles && role ? [role as EntryInput["roles"][number]] : [],
        screens: [...(initial.screens ?? [])],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title} size="lg">
      <div className="flex flex-col gap-4">
        <Input label="Titre" value={entryTitle} onChange={(e) => setEntryTitle(e.target.value)} maxLength={200} />
        <Textarea
          label="Questions"
          hint="Une formulation par ligne, telle que les utilisateurs la tapent."
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
          rows={4}
        />
        <Textarea label="Réponse" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={5} maxLength={4000} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Lien (adresse interne)" placeholder="/disponibilites" value={href} onChange={(e) => setHref(e.target.value)} />
          <Input label="Libellé du lien" placeholder="Disponibilités" value={hrefLabel} onChange={(e) => setHrefLabel(e.target.value)} />
        </div>
        {showRoles && (
          <Select
            label="Pour"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={[{ value: "", label: "Tous les rôles" }, ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))]}
          />
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !entryTitle.trim() || !answer.trim() || !questions.trim()}>
            {saving ? "Enregistrement…" : submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Onglets ─────────────────────────────────────────────────────────────────

function UsageTab({ stats }: { readonly stats: StatsPeriod }) {
  const t = stats.totals;
  const tiles = [
    { label: "Questions", value: t.questions },
    { label: "Réponses", value: t.answered },
    { label: "Dont données", value: t.dataAnswers },
    { label: "Suggestions", value: t.suggested },
    { label: "Sans réponse", value: t.unanswered },
    { label: "Part « Utile »", value: stats.helpfulRate === null ? "—" : `${Math.round(stats.helpfulRate * 100)} %` },
  ];
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-muted">
        Du {dateFmt.format(new Date(stats.from))} au {dateFmt.format(new Date(stats.to))}, pour toute l&apos;instance. Aucune donnée de personne.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-card border border-line bg-surface p-4 shadow-card">
            <p className="text-[13px] text-ink-muted">{tile.label}</p>
            <p className="font-display text-2xl font-bold tabular-nums text-ink">{tile.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuestionsTab({ pending, entries, status }: { readonly pending: PendingRow[]; readonly entries: AdminEntry[]; readonly status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [answering, setAnswering] = useState<PendingRow | null>(null);
  const [linking, setLinking] = useState<PendingRow | null>(null);
  const [linkKey, setLinkKey] = useState("");
  const [deleting, setDeleting] = useState<PendingRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(row: PendingRow, body: unknown, done: string) {
    setBusy(true);
    try {
      await send(`/api/assistant/admin/pending/${row.id}`, "PATCH", body);
      toast.success(done);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <Alert tone="info">
        Les questions arrivent sans le nom ni l&apos;église de la personne ; emails, téléphones et liens sont masqués. Un prénom
        peut subsister : supprimez la question si besoin.
      </Alert>
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <Link
            key={value}
            href={`/admin/assistant?onglet=questions&statut=${value}`}
            aria-current={value === status ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
              value === status ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
      {pending.length === 0 ? (
        <EmptyState icon={Inbox} title="Aucune question ici" description="Les questions sans réponse ou jugées « Pas utile » apparaîtront ici." />
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((row) => (
            <li key={row.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
              <div className="flex flex-wrap items-start gap-2">
                <p className="min-w-0 flex-1 text-[15px] font-semibold text-ink">« {row.text} »</p>
                {row.count > 1 && <StatusChip tone="brand">{row.count} fois</StatusChip>}
                {row.reason === "NOT_HELPFUL" && <StatusChip tone="warning">Jugée « Pas utile »</StatusChip>}
              </div>
              <p className="text-[13px] text-ink-muted">
                {[row.screen && `Écran ${row.screen}`, row.role && (ROLE_LABEL[row.role] ?? row.role), `dernière fois le ${dateFmt.format(new Date(row.lastAt))}`]
                  .filter(Boolean)
                  .join(" · ")}
                {row.entryKey && ` · fiche ${row.entryKey}`}
              </p>
              {status === "OPEN" && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setAnswering(row)}>
                    Répondre
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => { setLinkKey(""); setLinking(row); }}>
                    Rattacher à…
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(row, { action: "offtopic" }, "Question classée hors sujet")}>
                    Hors sujet
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(row)}>
                    Supprimer
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {answering && (
        <EntryForm
          title="Répondre à la question"
          initial={{ title: answering.text.slice(0, 200), questions: [answering.text] }}
          submitLabel="Ajouter à la base"
          showRoles
          onClose={() => setAnswering(null)}
          onSubmit={async (entry) => {
            await send(`/api/assistant/admin/pending/${answering.id}`, "PATCH", { action: "answer", entry });
            setAnswering(null);
            toast.success("Réponse ajoutée : elle sert dès la question suivante");
            router.refresh();
          }}
        />
      )}
      {linking && (
        <Modal open onClose={() => setLinking(null)} title="Rattacher à une fiche">
          <div className="flex flex-col gap-4">
            <p className="text-[15px] text-ink">« {linking.text} » deviendra une formulation de la fiche choisie.</p>
            <Select
              label="Fiche"
              value={linkKey}
              onChange={(e) => setLinkKey(e.target.value)}
              placeholder="Choisir une fiche"
              options={entries.filter((e) => !e.hidden).map((e) => ({ value: e.key, label: `${e.key} — ${e.title}` }))}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setLinking(null)}>
                Annuler
              </Button>
              <Button
                disabled={!linkKey || busy}
                onClick={async () => {
                  await act(linking, { action: "link", entryKey: linkKey }, "Question rattachée");
                  setLinking(null);
                }}
              >
                Rattacher
              </Button>
            </div>
          </div>
        </Modal>
      )}
      <ConfirmModal
        open={!!deleting}
        title="Supprimer la question ?"
        message="Elle disparaît définitivement de la liste."
        confirmLabel="Supprimer"
        variant="danger"
        confirming={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try {
            await send(`/api/assistant/admin/pending/${deleting.id}`, "DELETE");
            toast.success("Question supprimée");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Échec");
          } finally {
            setBusy(false);
            setDeleting(null);
          }
        }}
      />
    </section>
  );
}

function BaseTab({ entries }: { readonly entries: AdminEntry[] }) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("");
  const [editing, setEditing] = useState<AdminEntry | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminEntry | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (!origin || (origin === "hidden" ? e.hidden : e.origin === origin && !e.hidden)) &&
        (!q || `${e.key} ${e.title} ${e.questions.join(" ")}`.toLowerCase().includes(q))
    );
  }, [entries, query, origin]);

  async function patch(entry: AdminEntry, body: unknown, done: string) {
    try {
      await send(`/api/assistant/admin/entries/${encodeURIComponent(entry.key)}`, "PATCH", body);
      toast.success(done);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une fiche…" aria-label="Rechercher une fiche" />
        </div>
        <div className="w-48">
          <Select
            label="Origine"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            options={[
              { value: "", label: "Toutes" },
              { value: "builtin", label: "Fournies" },
              { value: "override", label: "Corrigées" },
              { value: "custom", label: "Ajoutées" },
              { value: "hidden", label: "Masquées" },
            ]}
          />
        </div>
        <Button onClick={() => setEditing("new")}>Ajouter une fiche</Button>
      </div>
      <p className="text-[13px] text-ink-muted">
        {filtered.length} fiche{filtered.length > 1 ? "s" : ""}. Une correction ne change que le texte : l&apos;audience d&apos;une fiche fournie reste
        celle de Koinonia, et une mise à jour de Koinonia ne l&apos;efface pas.
      </p>
      <ul className="flex flex-col gap-3">
        {filtered.map((e) => (
          <li key={e.key} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[13px] text-ink-muted">{e.key}</span>
              <p className="min-w-0 flex-1 font-semibold text-ink">{e.title}</p>
              <StatusChip tone={e.origin === "custom" ? "brand" : e.origin === "override" ? "info" : "neutral"}>{ORIGIN_LABEL[e.origin]}</StatusChip>
              {e.kind === "data" && <StatusChip tone="accent">Données</StatusChip>}
              {e.hidden && <StatusChip tone="warning">Masquée</StatusChip>}
            </div>
            <p className="line-clamp-2 text-[13px] text-ink-muted">{e.answer}</p>
            <p className="text-[13px] text-ink-muted">
              Pour : {audienceLabel(e)}
              {e.module ? ` · module ${e.module}` : ""}
              {e.aliases.length > 0 ? ` · ${e.aliases.length} formulation${e.aliases.length > 1 ? "s" : ""} rattachée${e.aliases.length > 1 ? "s" : ""}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {!e.hidden && (
                <Button size="sm" variant="secondary" onClick={() => setEditing(e)}>
                  {e.origin === "custom" ? "Modifier" : "Corriger"}
                </Button>
              )}
              {e.origin === "override" && (
                <Button size="sm" variant="ghost" onClick={() => void patch(e, { action: "restore" }, "Texte fourni rétabli")}>
                  Rétablir
                </Button>
              )}
              {e.origin !== "custom" &&
                (e.hidden ? (
                  <Button size="sm" variant="ghost" onClick={() => void patch(e, { action: "show" }, "Fiche affichée")}>
                    Afficher
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => void patch(e, { action: "hide" }, "Fiche masquée")}>
                    Masquer
                  </Button>
                ))}
              {e.origin === "custom" && (
                <Button size="sm" variant="ghost" onClick={() => setDeleting(e)}>
                  Supprimer
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <EntryForm
          title={editing === "new" ? "Ajouter une fiche" : `${editing.origin === "custom" ? "Modifier" : "Corriger"} ${editing.key}`}
          initial={editing === "new" ? {} : { ...editing, questions: [...editing.questions], roles: (editing.audience.roles ?? []) as EntryInput["roles"] }}
          submitLabel="Enregistrer"
          showRoles={editing === "new" || editing.origin === "custom"}
          onClose={() => setEditing(null)}
          onSubmit={async (entry) => {
            if (editing === "new") await send("/api/assistant/admin/entries", "POST", entry);
            else await send(`/api/assistant/admin/entries/${encodeURIComponent(editing.key)}`, "PATCH", { action: "override", entry });
            setEditing(null);
            toast.success("Fiche enregistrée");
            router.refresh();
          }}
        />
      )}
      <ConfirmModal
        open={!!deleting}
        title="Supprimer la fiche ?"
        message="La fiche et ses formulations rattachées disparaissent de la base."
        confirmLabel="Supprimer"
        variant="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await send(`/api/assistant/admin/entries/${encodeURIComponent(deleting.key)}`, "DELETE");
            toast.success("Fiche supprimée");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Échec");
          } finally {
            setDeleting(null);
          }
        }}
      />
    </section>
  );
}

function SettingsTab({ enabled }: { readonly enabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try {
      await send("/api/assistant/settings", "PUT", { enabled: !enabled });
      toast.success(enabled ? "Assistant désactivé" : "Assistant activé");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <MessageCircleQuestion aria-hidden="true" className="size-6 text-brand-text" strokeWidth={1.75} />
        <p className="min-w-0 flex-1 font-semibold text-ink">L&apos;assistant est {enabled ? "activé" : "désactivé"} pour toute l&apos;instance</p>
        <StatusChip tone={enabled ? "success" : "neutral"}>{enabled ? "Activé" : "Désactivé"}</StatusChip>
      </div>
      <p className="text-[15px] text-ink-muted">
        Activé, chaque église le propose à ses membres ; l&apos;Admin d&apos;une église peut le couper dans les paramètres de l&apos;église.
        Désactivé, le bouton d&apos;aide mène au guide d&apos;utilisation. Aucune question ne quitte Koinonia.
      </p>
      <div>
        <Button variant={enabled ? "secondary" : "primary"} onClick={() => void toggle()} disabled={saving}>
          {saving ? "Enregistrement…" : enabled ? "Désactiver l'assistant" : "Activer l'assistant"}
        </Button>
      </div>
    </section>
  );
}

export default function AssistantAdminClient({
  tab,
  enabled,
  status,
  stats,
  pending,
  entries,
}: {
  readonly tab: "usage" | "questions" | "base" | "reglages";
  readonly enabled: boolean;
  readonly status: string;
  readonly stats: StatsPeriod | null;
  readonly pending: PendingRow[] | null;
  readonly entries: AdminEntry[] | null;
}) {
  return (
    <>
      {!enabled && tab !== "reglages" && (
        <Alert tone="warning" action={<Link href="/admin/assistant?onglet=reglages" className="font-semibold underline">Réglages</Link>}>
          L&apos;assistant est désactivé : les utilisateurs voient le lien vers le guide.
        </Alert>
      )}
      {tab === "usage" && stats && <UsageTab stats={stats} />}
      {tab === "questions" && pending && <QuestionsTab pending={pending} entries={entries ?? []} status={status} />}
      {tab === "base" && entries && <BaseTab entries={entries} />}
      {tab === "reglages" && <SettingsTab enabled={enabled} />}
    </>
  );
}
