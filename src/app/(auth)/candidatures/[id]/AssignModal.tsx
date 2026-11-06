"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, CheckboxGroup, Modal, useToast } from "@/components/ui";
import type { MemberMatch } from "@/modules/serving";

type Dept = { readonly id: string; readonly name: string; readonly ministryName: string };
type LinkedMember = { readonly id: string; readonly firstName: string; readonly lastName: string } | null;

type Props = {
  readonly applicationId: string;
  readonly name: string;
  readonly departments: readonly Dept[];
  /** Départements qui suivent déjà la personne : non proposés. */
  readonly excludedIds: readonly string[];
  readonly member: LinkedMember;
  /** Rattachement figé une fois la personne accueillie. */
  readonly memberLocked: boolean;
  readonly reassign: boolean;
};

const REASON: Record<MemberMatch["reason"], string> = {
  name: "même nom",
  email: "même email",
  both: "même nom et même email",
};

/** Orientation par le PVS vers un ou plusieurs départements, avec rattachement à une fiche STAR. */
export default function AssignModal({ applicationId, name, departments, excludedIds, member, memberLocked, reassign }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [matches, setMatches] = useState<MemberMatch[] | null>(null);
  const [sending, setSending] = useState(false);

  async function openModal() {
    setOpen(true);
    setSelected([]);
    if (memberLocked || matches) return;
    const res = await fetch(`/api/serving/applications/${applicationId}/member-matches`);
    const json = await res.json().catch(() => ({}));
    setMatches(res.ok && Array.isArray(json) ? json : []);
  }

  async function send(url: string, method: string, body: unknown, success: string): Promise<boolean> {
    setSending(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "L'action n'a pas pu être enregistrée.");
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } finally {
      setSending(false);
    }
  }

  async function link(memberId: string | null) {
    await send(
      `/api/serving/applications/${applicationId}`,
      "PATCH",
      { action: "link-member", memberId },
      memberId ? "Candidature rattachée à la fiche STAR" : "Rattachement retiré"
    );
  }

  async function assign() {
    const ok = await send(
      `/api/serving/applications/${applicationId}/assignments`,
      "POST",
      { departmentIds: selected },
      selected.length > 1 ? "Personne orientée vers les départements" : "Personne orientée vers le département"
    );
    if (ok) setOpen(false);
  }

  const options = departments
    .filter((d) => !excludedIds.includes(d.id))
    .map((d) => ({ value: d.id, label: `${d.name} · ${d.ministryName}` }));
  const suggestions = (matches ?? []).filter((m) => m.id !== member?.id);

  return (
    <>
      <Button onClick={openModal}>{reassign ? "Réorienter" : "Valider et orienter"}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Orienter ${name}`} size="lg">
        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Fiche STAR</h3>
            {member ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line p-3">
                <span className="text-sm text-ink">
                  Rattachée à {member.firstName} {member.lastName}
                </span>
                {!memberLocked && (
                  <Button variant="ghost" size="sm" disabled={sending} onClick={() => link(null)}>
                    Retirer
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                Sans rattachement, une fiche STAR sera créée à partir de la candidature au premier accueil.
              </p>
            )}
            {!memberLocked && matches === null && <p className="text-sm text-ink-subtle">Recherche de fiches existantes…</p>}
            {!memberLocked && suggestions.length > 0 && (
              <Alert tone="warning" title="Fiche STAR existante ?">
                <ul className="mt-2 space-y-2">
                  {suggestions.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">
                        {m.firstName} {m.lastName} ({REASON[m.reason]})
                        {m.departmentNames.length > 0 && ` · ${m.departmentNames.join(", ")}`}
                      </span>
                      <Button variant="secondary" size="sm" disabled={sending} onClick={() => link(m.id)}>
                        Rattacher
                      </Button>
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
          </section>

          <CheckboxGroup label="Départements" options={options} selected={selected} onChange={setSelected} />
          <p className="text-sm text-ink-muted">
            Les responsables et le Ministre de chaque département sont notifiés et pourront consulter la fiche.
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button disabled={sending || selected.length === 0} onClick={assign}>
              {sending ? "Envoi…" : "Orienter"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
