"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Pencil, Printer, Trash2, X } from "lucide-react";
import { Button, IconButton, Input, Modal, SearchInput, Select } from "@/components/ui";
import type { ChurchAccount, TeamView } from "@/modules/ticketing";
import { useApi } from "../../use-api";
import { fromLocalInput, toLocalInput } from "./SettingsTab";

type Assignment = TeamView["assignments"][number];
type Department = { id: string; name: string; ministry: string };

const NO_POST = "";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

function slot(a: Assignment): string {
  if (!a.startsAt && !a.endsAt) return "Tout l'événement";
  if (a.startsAt && a.endsAt) return `${fmt(a.startsAt)} → ${fmt(a.endsAt)}`;
  return a.startsAt ? `À partir de ${fmt(a.startsAt)}` : `Jusqu'à ${fmt(a.endsAt)}`;
}

/** Poste renommable sur place, supprimable (ses affectations restent, sans poste). */
function PostChip({ eventId, post }: { readonly eventId: string; readonly post: TeamView["posts"][number] }) {
  const { call, busy } = useApi();
  const [name, setName] = useState<string | null>(null);
  if (name !== null) {
    return (
      <li className="flex items-center gap-1">
        <input
          aria-label={`Nouveau nom du poste ${post.name}`}
          className="h-9 w-44 rounded-control border border-control-line bg-surface px-2 text-[15px] text-ink"
          value={name}
          maxLength={120}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <IconButton
          icon={Check}
          aria-label="Enregistrer le nom"
          disabled={busy || !name.trim()}
          onClick={async () => {
            if (await call(`/api/ticketing/events/${eventId}/posts/${post.id}`, "PATCH", { name: name.trim() }, "Poste renommé")) setName(null);
          }}
        />
        <IconButton icon={X} aria-label="Annuler" onClick={() => setName(null)} />
      </li>
    );
  }
  return (
    <li className="flex items-center gap-1 rounded-chip border border-line bg-surface px-2 py-1 text-[13px] text-ink">
      {post.name}
      <button type="button" aria-label={`Renommer le poste ${post.name}`} className="p-1 text-ink-subtle hover:text-ink" onClick={() => setName(post.name)}>
        <Pencil className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`Supprimer le poste ${post.name}`}
        className="p-1 text-ink-subtle hover:text-ink"
        onClick={() => call(`/api/ticketing/events/${eventId}/posts/${post.id}`, "DELETE", undefined, "Poste supprimé")}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </li>
  );
}

/** Choix d'un compte de l'église, filtrable par département et par nom. */
function AccountPicker({
  accounts,
  departments,
  value,
  onChange,
}: {
  readonly accounts: ChurchAccount[];
  readonly departments: Department[];
  readonly value: string;
  readonly onChange: (id: string) => void;
}) {
  const [departmentId, setDepartmentId] = useState("");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("fr");
    return accounts.filter(
      (a) =>
        (!departmentId || a.departmentIds.includes(departmentId)) &&
        (!q || `${a.name ?? ""} ${a.email}`.toLocaleLowerCase("fr").includes(q))
    );
  }, [accounts, departmentId, query]);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Département"
          value={departmentId}
          placeholder="Tous les départements"
          options={departments.map((d) => ({ value: d.id, label: `${d.name} (${d.ministry})` }))}
          onChange={(e) => setDepartmentId(e.target.value)}
        />
        <div className="flex flex-col justify-end">
          <SearchInput aria-label="Chercher une personne" placeholder="Chercher un nom…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <Select
        label={`Personne (${filtered.length})`}
        value={filtered.some((a) => a.id === value) ? value : ""}
        placeholder={filtered.length ? "Choisir une personne" : "Personne ne correspond"}
        options={filtered.map((a) => ({ value: a.id, label: a.name ? `${a.name} (${a.email})` : a.email }))}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-[13px] text-ink-muted">Le département aide à retrouver les gens : n&apos;importe quel membre de l&apos;église peut être affecté.</p>
    </div>
  );
}

/** Modification du poste et du créneau d'une affectation. */
function EditAssignment({
  eventId,
  assignment,
  posts,
  onClose,
}: {
  readonly eventId: string;
  readonly assignment: Assignment;
  readonly posts: TeamView["posts"];
  readonly onClose: () => void;
}) {
  const { call, busy } = useApi();
  const [form, setForm] = useState({
    postId: assignment.postId ?? NO_POST,
    startsAt: toLocalInput(assignment.startsAt),
    endsAt: toLocalInput(assignment.endsAt),
  });
  async function save() {
    const ok = await call(
      `/api/ticketing/events/${eventId}/assignments/${assignment.id}`,
      "PATCH",
      { postId: form.postId || null, startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt) },
      "Affectation modifiée"
    );
    if (ok) onClose();
  }
  return (
    <Modal open onClose={onClose} title={`Affectation de ${assignment.name}`}>
      <div className="space-y-3">
        <Select
          label="Poste"
          value={form.postId}
          placeholder="Sans poste"
          options={posts.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(e) => setForm({ ...form, postId: e.target.value })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Début (facultatif)" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          <Input label="Fin (facultative)" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
        </div>
        {assignment.userId && <p className="text-[13px] text-ink-muted">La personne est prévenue du changement.</p>}
        <Button type="button" disabled={busy} onClick={save}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </Modal>
  );
}

/** Postes et affectations (membre de l'église ou intervenant), planning par poste, badges imprimables. */
export default function StaffSection({
  eventId,
  team,
  accounts,
  departments,
}: {
  readonly eventId: string;
  readonly team: TeamView;
  readonly accounts: ChurchAccount[];
  readonly departments: Department[];
}) {
  const { call, busy } = useApi();
  const [post, setPost] = useState("");
  const [form, setForm] = useState({ who: "member", userId: "", guestName: "", postId: "", startsAt: "", endsAt: "" });
  const [editing, setEditing] = useState<Assignment | null>(null);

  // Planning : un bloc par poste dans l'ordre des postes, puis les personnes sans poste.
  const columns = useMemo(() => {
    const blocks = [...team.posts.map((p) => ({ id: p.id, name: p.name })), { id: NO_POST, name: "Sans poste" }].map((p) => ({
      ...p,
      people: team.assignments.filter((a) => (a.postId ?? NO_POST) === p.id),
    }));
    return blocks.filter((b) => b.id !== NO_POST || b.people.length > 0);
  }, [team]);

  async function addAssignment() {
    const ok = await call(
      `/api/ticketing/events/${eventId}/assignments`,
      "POST",
      {
        userId: form.who === "member" ? form.userId : null,
        guestName: form.who === "guest" ? form.guestName : null,
        postId: form.postId || null,
        startsAt: fromLocalInput(form.startsAt),
        endsAt: fromLocalInput(form.endsAt),
      },
      "Affectation ajoutée"
    );
    if (ok) setForm({ ...form, userId: "", guestName: "" });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">Postes et planning de l&apos;équipe</h2>
        {team.assignments.length > 0 && (
          <Link href={`/billetterie/${eventId}/badges`} className="inline-flex items-center gap-1 text-[15px] font-semibold text-brand-text underline">
            <Printer className="size-4" aria-hidden="true" /> Imprimer les badges
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Input label="Nouveau poste" placeholder="Porte principale, parking, louange…" value={post} onChange={(e) => setPost(e.target.value)} />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !post.trim()}
          onClick={async () => {
            if (await call(`/api/ticketing/events/${eventId}/posts`, "POST", { name: post.trim() }, "Poste créé")) setPost("");
          }}
        >
          Créer
        </Button>
      </div>
      {team.posts.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {team.posts.map((p) => (
            <PostChip key={p.id} eventId={eventId} post={p} />
          ))}
        </ul>
      )}

      <fieldset className="space-y-3 rounded-card border border-line bg-surface p-4">
        <legend className="px-1 font-semibold text-ink">Affecter</legend>
        <Select
          label="Qui"
          value={form.who}
          options={[
            { value: "member", label: "Un membre de l'église" },
            { value: "guest", label: "Un intervenant, prestataire ou invité" },
          ]}
          onChange={(e) => setForm({ ...form, who: e.target.value })}
        />
        {form.who === "member" ? (
          <AccountPicker accounts={accounts} departments={departments} value={form.userId} onChange={(userId) => setForm({ ...form, userId })} />
        ) : (
          <Input label="Nom" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} />
        )}
        <Select
          label="Poste"
          value={form.postId}
          placeholder="Sans poste"
          options={team.posts.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(e) => setForm({ ...form, postId: e.target.value })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Début (facultatif)" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          <Input label="Fin (facultative)" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
        </div>
        <Button type="button" disabled={busy || (form.who === "member" ? !form.userId : !form.guestName.trim())} onClick={addAssignment}>
          Affecter
        </Button>
      </fieldset>

      {team.assignments.length === 0 ? (
        <p className="text-[15px] text-ink-muted">Personne n&apos;est encore affecté.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {columns.map((c) => (
            <section key={c.id || "none"} aria-label={c.name} className="rounded-card border border-line bg-surface">
              <h3 className="flex items-center justify-between border-b border-line px-4 py-2.5 font-semibold text-ink">
                {c.name}
                <span className="text-[13px] font-normal text-ink-muted">
                  {c.people.length} personne{c.people.length > 1 ? "s" : ""}
                </span>
              </h3>
              {c.people.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-ink-muted">Personne pour l&apos;instant.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {c.people.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <span className="min-w-0 text-[15px] text-ink">
                        {a.name}
                        {a.guest && <span className="text-ink-muted"> (intervenant)</span>}
                        <span className="block text-[13px] text-ink-muted">{slot(a)}</span>
                      </span>
                      <span className="flex shrink-0 items-center">
                        <IconButton icon={Pencil} aria-label={`Modifier l'affectation de ${a.name}`} onClick={() => setEditing(a)} />
                        <IconButton
                          icon={Trash2}
                          aria-label={`Retirer ${a.name}`}
                          onClick={() => call(`/api/ticketing/events/${eventId}/assignments/${a.id}`, "DELETE", undefined, "Affectation retirée")}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
      {editing && <EditAssignment eventId={eventId} assignment={editing} posts={team.posts} onClose={() => setEditing(null)} />}
    </section>
  );
}
