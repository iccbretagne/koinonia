"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer, Trash2 } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import type { TeamView } from "@/modules/ticketing";
import { useApi } from "../../use-api";
import { fromLocalInput } from "./SettingsTab";

/** Postes et affectations (membre de l'église ou intervenant), badges imprimables. */
export default function StaffSection({
  eventId,
  team,
  accounts,
}: {
  readonly eventId: string;
  readonly team: TeamView;
  readonly accounts: { id: string; name: string | null; email: string }[];
}) {
  const { call, busy } = useApi();
  const [post, setPost] = useState("");
  const [form, setForm] = useState({ who: "member", userId: "", guestName: "", postId: "", startsAt: "", endsAt: "" });
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "");

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
        <h2 className="text-lg font-bold text-ink">Postes et affectations</h2>
        {team.assignments.length > 0 && (
          <Link href={`/billetterie/${eventId}/badges`} className="inline-flex items-center gap-1 text-[15px] font-semibold text-brand-text underline">
            <Printer className="size-4" aria-hidden="true" /> Imprimer les badges
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Input label="Nouveau poste" placeholder="Porte principale, parking…" value={post} onChange={(e) => setPost(e.target.value)} />
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
            <li key={p.id} className="flex items-center gap-1 rounded-chip border border-line bg-surface px-2 py-1 text-[13px] text-ink">
              {p.name}
              <button type="button" aria-label={`Supprimer le poste ${p.name}`} className="text-ink-subtle" onClick={() => call(`/api/ticketing/events/${eventId}/posts/${p.id}`, "DELETE", undefined, "Poste supprimé")}>
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </li>
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
          <Select
            label="Compte"
            value={form.userId}
            placeholder="Choisir une personne"
            options={accounts.map((a) => ({ value: a.id, label: a.name ? `${a.name} (${a.email})` : a.email }))}
            onChange={(e) => setForm({ ...form, userId: e.target.value })}
          />
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
          <Input label="Début du créneau (facultatif)" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          <Input label="Fin du créneau" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
        </div>
        <Button type="button" disabled={busy || (form.who === "member" ? !form.userId : !form.guestName.trim())} onClick={addAssignment}>
          Affecter
        </Button>
      </fieldset>

      <ul className="divide-y divide-line rounded-card border border-line bg-surface">
        {team.assignments.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[15px] text-ink">
              {a.name}
              {a.guest && <span className="text-ink-muted"> (intervenant)</span>} — {a.postName ?? "sans poste"}
              {a.startsAt && <span className="block text-[13px] text-ink-muted">{fmt(a.startsAt)} → {fmt(a.endsAt)}</span>}
            </span>
            <Button type="button" size="sm" variant="ghost" aria-label={`Retirer ${a.name}`} onClick={() => call(`/api/ticketing/events/${eventId}/assignments/${a.id}`, "DELETE", undefined, "Affectation retirée")}>
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
        {team.assignments.length === 0 && <li className="px-4 py-3 text-[15px] text-ink-muted">Personne n&apos;est encore affecté.</li>}
      </ul>
    </section>
  );
}
