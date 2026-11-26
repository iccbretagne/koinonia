"use client";

import { useState, type FormEvent } from "react";
import { Copy, Link2, UserPlus } from "lucide-react";
import { Alert, Button, ConfirmModal, Input, Modal, Select, StatusChip, useToast } from "@/components/ui";
import type { CampaignStatus } from "@/modules/campaigns/schemas";
import { useApi } from "../_components/use-api";
import CandidatePicker from "./CandidatePicker";
import type { AssignmentData, CampaignFormData } from "./types";

type Respondent = AssignmentData["respondents"][number];
type Target = { assignment: AssignmentData; formTitle: string };

/**
 * Onglet Répondants : par destinataire, les comptes de l'église (cas normal) et, par exception,
 * les personnes sans compte avec leur lien personnel. Le lien n'est jamais relu : le copier
 * demande d'en générer un nouveau, ce qui révoque l'ancien.
 */
export default function RespondentsTab({
  campaignId,
  campaignStatus,
  forms,
}: {
  readonly campaignId: string;
  readonly campaignStatus: CampaignStatus;
  readonly forms: readonly CampaignFormData[];
}) {
  const { call, busy } = useApi();
  const toast = useToast();
  const [formFilter, setFormFilter] = useState("");
  const [addAccount, setAddAccount] = useState<Target | null>(null);
  const [addGuest, setAddGuest] = useState<Target | null>(null);
  const [guest, setGuest] = useState({ name: "", email: "" });
  const [removing, setRemoving] = useState<{ assignmentId: string; respondent: Respondent } | null>(null);
  const [regenerating, setRegenerating] = useState<{ assignmentId: string; respondent: Respondent } | null>(null);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const open = campaignStatus === "OPEN";

  const shownForms = forms.filter((f) => !formFilter || f.key === formFilter);

  async function addUser(userId: string) {
    if (!addAccount) return;
    const done = await call(`/api/campaigns/assignments/${addAccount.assignment.id}/respondents`, "POST", { userId }, "Répondant ajouté");
    if (done) setAddAccount(null);
  }

  async function submitGuest(e: FormEvent) {
    e.preventDefault();
    if (!addGuest) return;
    const done = await call(
      `/api/campaigns/assignments/${addGuest.assignment.id}/respondents`,
      "POST",
      { name: guest.name.trim(), email: guest.email.trim() },
      open ? "Personne ajoutée, lien envoyé par email" : "Personne ajoutée"
    );
    if (done) {
      setAddGuest(null);
      setGuest({ name: "", email: "" });
    }
  }

  async function remove() {
    if (!removing) return;
    const done = await call(
      `/api/campaigns/assignments/${removing.assignmentId}/respondents/${removing.respondent.id}`,
      "DELETE",
      undefined,
      "Répondant retiré"
    );
    if (done) setRemoving(null);
  }

  async function regenerate() {
    if (!regenerating) return;
    const done = await call<{ link: string | null }>(
      `/api/campaigns/assignments/${regenerating.assignmentId}/respondents/${regenerating.respondent.id}/link`,
      "POST"
    );
    if (done?.link) setLink({ name: regenerating.respondent.name, url: done.link });
    if (done) setRegenerating(null);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("Lien copié");
    } catch {
      toast.error("Copie impossible : sélectionnez le lien et copiez-le.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="md:max-w-sm">
        <Select
          label="Questionnaire"
          value={formFilter}
          onChange={(e) => setFormFilter(e.target.value)}
          options={[{ value: "", label: "Tous les questionnaires" }, ...forms.map((f) => ({ value: f.key, label: f.title }))]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {shownForms.flatMap((f) =>
          f.assignments.map((a) => (
            <section key={a.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-display text-[15px] font-semibold leading-[22px] text-ink">{a.label}</h2>
                  <p className="text-[13px] leading-[18px] text-ink-muted">{f.title}</p>
                </div>
                {f.confidential && <StatusChip tone="danger">Confidentiel</StatusChip>}
              </div>

              {a.respondents.length === 0 ? (
                <p className="text-[15px] text-warning">Aucun répondant : personne ne peut remplir ce questionnaire.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {a.respondents.map((r) => (
                    <li key={r.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                          <span className="truncate">{r.name}</span>
                          {r.kind === "account" ? (
                            <StatusChip tone="neutral">Compte</StatusChip>
                          ) : (
                            <StatusChip tone="warning">Lien personnel · exception</StatusChip>
                          )}
                        </p>
                        {r.email && <p className="truncate text-[13px] text-ink-muted">{r.email}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {r.kind === "link" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setRegenerating({ assignmentId: a.id, respondent: r })}
                          >
                            <Link2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
                            {r.hasLink ? "Nouveau lien" : "Créer le lien"}
                          </Button>
                        )}
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setRemoving({ assignmentId: a.id, respondent: r })}>
                          Retirer
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button type="button" size="sm" variant="secondary" onClick={() => setAddAccount({ assignment: a, formTitle: f.title })}>
                  <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Ajouter un compte
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAddGuest({ assignment: a, formTitle: f.title })}>
                  Ajouter une personne sans compte
                </Button>
              </div>
            </section>
          ))
        )}
      </div>

      <Modal open={addAccount !== null} onClose={() => setAddAccount(null)} title={`Ajouter un répondant · ${addAccount?.assignment.label ?? ""}`}>
        {addAccount && (
          <CandidatePicker
            campaignId={campaignId}
            exclude={(c) => addAccount.assignment.respondents.some((r) => r.kind === "account" && r.email === c.email)}
            actionLabel="Ajouter"
            disabled={busy}
            onPick={(c) => void addUser(c.id)}
          />
        )}
      </Modal>

      <Modal open={addGuest !== null} onClose={() => setAddGuest(null)} title="Ajouter une personne sans compte">
        <form className="flex flex-col gap-4" onSubmit={submitGuest}>
          <Alert tone="warning" title="Exception.">
            Réservé à une personne qui n&apos;a pas de compte Koinonia dans l&apos;église. Elle remplira « {addGuest?.assignment.label} »
            par un lien personnel{open ? ", envoyé à son adresse dès maintenant" : ", envoyé à l'ouverture de la campagne"}.
          </Alert>
          <Input label="Nom" value={guest.name} onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))} maxLength={150} required />
          <Input
            label="Email"
            type="email"
            value={guest.email}
            onChange={(e) => setGuest((g) => ({ ...g, email: e.target.value }))}
            maxLength={254}
            required
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => setAddGuest(null)} disabled={busy}>
              Annuler
            </Button>
            <Button type="submit" disabled={busy || !guest.name.trim() || !guest.email.trim()}>
              {busy ? "Ajout…" : "Ajouter"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={removing !== null}
        title={`Retirer ${removing?.respondent.name ?? ""} ?`}
        message="Cette personne n'aura plus accès au questionnaire ; son lien personnel cesse de fonctionner. Les réponses déjà saisies restent."
        confirmLabel="Retirer"
        confirming={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />

      <ConfirmModal
        open={regenerating !== null}
        title="Générer un nouveau lien ?"
        message={`L'ancien lien de ${regenerating?.respondent.name ?? "cette personne"} cesse de fonctionner.${
          open ? " Le nouveau lui est envoyé par email." : ""
        } Vous pourrez le copier.`}
        confirmLabel="Générer le lien"
        variant="primary"
        confirming={busy}
        onConfirm={regenerate}
        onCancel={() => setRegenerating(null)}
      />

      <Modal open={link !== null} onClose={() => setLink(null)} title={`Lien personnel · ${link?.name ?? ""}`} mobileLayout="sheet">
        <div className="flex flex-col gap-4">
          <Alert tone="warning" title="Lien personnel : ne le partagez pas.">
            Il ouvre ce questionnaire sans connexion. Transmettez-le à cette seule personne, par un canal privé.
          </Alert>
          <Input label="Lien" value={link?.url ?? ""} readOnly onFocus={(e) => e.target.select()} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button type="button" variant="secondary" onClick={() => setLink(null)}>
              Fermer
            </Button>
            <Button type="button" onClick={copy}>
              <Copy aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Copier le lien
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
