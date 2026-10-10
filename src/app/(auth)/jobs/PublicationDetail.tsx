"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Mail } from "lucide-react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import StatusChip from "@/components/ui/StatusChip";
import { buttonClasses } from "@/components/ui/button-classes";
import { useToast } from "@/components/ui/Toast";
import { ActionRow, DetailField } from "@/components/requests/DetailBlocks";
import type { Publication, PublicationKind, PublicationState } from "@/modules/jobs";
import { CHIP_LABEL, MODALITY_LABEL, STATE_LABEL, STATE_TONE, expiryLabel, rateLabel, typeLabel } from "./board";

/** Route d'API et statuts de chaque sorte de publication (routes existantes, inchangées). */
const API: Record<PublicationKind, { endpoint: (id: string) => string; edit: (id: string) => string; active: string }> = {
  OFFER: { endpoint: (id) => `/api/jobs/${id}`, edit: (id) => `/jobs/${id}/edit`, active: "PUBLISHED" },
  MISSION: { endpoint: (id) => `/api/jobs/freelance/missions/${id}`, edit: (id) => `/jobs/freelance/missions/${id}/edit`, active: "ACTIVE" },
  SEEKER: { endpoint: (id) => `/api/jobs/seekers/${id}`, edit: (id) => `/jobs/seekers/${id}/edit`, active: "ACTIVE" },
  FREELANCE: { endpoint: (id) => `/api/jobs/freelance/profiles/${id}`, edit: (id) => `/jobs/freelance/profiles/${id}/edit`, active: "ACTIVE" },
};

/** Clôture par l'auteur (pourvue, a trouvé, indisponible) et remise en ligne, hors offres. */
const AUTHOR_CLOSE: Partial<Record<PublicationKind, { status: string; state: PublicationState; close: string; reopen: string; done: string; reopened: string }>> = {
  MISSION: { status: "FILLED", state: "filled", close: "Mission pourvue", reopen: "Remettre en ligne", done: "Mission marquée pourvue", reopened: "Mission remise en ligne" },
  SEEKER: { status: "FOUND", state: "found", close: "J'ai trouvé", reopen: "Je cherche de nouveau", done: "Profil marqué « a trouvé »", reopened: "Profil remis en ligne" },
  FREELANCE: { status: "UNAVAILABLE", state: "unavailable", close: "Plus disponible", reopen: "De nouveau disponible", done: "Profil marqué indisponible", reopened: "Profil remis en ligne" },
};

const STATE_NOTICE: Record<Exclude<PublicationState, "active">, string> = {
  retired: "Cette publication a été retirée : elle n'apparaît plus dans la liste.",
  expired: "La date limite est passée : l'offre n'apparaît plus dans la liste.",
  filled: "Mission pourvue : elle n'apparaît plus dans la liste.",
  found: "Cette personne a trouvé : le profil n'apparaît plus dans la liste.",
  unavailable: "Ce profil est indisponible : il n'apparaît plus dans la liste.",
};

const longDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

type Pending = "retire" | "delete" | null;

/**
 * Détail d'une publication de l'espace Offres (spec 064), commun au panneau de la liste et aux
 * pages de détail des liens directs. Les actions suivent les règles des routes existantes.
 */
export default function PublicationDetail({
  publication: pub,
  canManage,
  nowMs,
  onChanged,
  onDeleted,
}: {
  readonly publication: Publication;
  readonly canManage: boolean;
  readonly nowMs: number;
  readonly onChanged: () => void;
  readonly onDeleted: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const api = API[pub.kind];
  const close = AUTHOR_CLOSE[pub.kind];
  const now = new Date(nowMs);
  const isRetired = pub.state === "retired";
  const isOpportunity = pub.kind === "OFFER" || pub.kind === "MISSION";
  const canAct = pub.isOwn || canManage;
  // Offre : son auteur la retire et la republie lui-même ; ailleurs, c'est la modération.
  const canRetire = canManage || (pub.kind === "OFFER" && pub.isOwn);
  const expiry = pub.kind === "OFFER" && pub.state === "active" ? expiryLabel(pub.deadline, now) : null;
  const rate = rateLabel(pub.dailyRate, pub.hourlyRate);
  const renewalUntil =
    pub.kind === "OFFER" && pub.renewalRequestedAt && !isRetired && canAct
      ? new Date(new Date(pub.renewalRequestedAt).getTime() + 14 * 86_400_000)
      : null;

  async function send(method: "PATCH" | "DELETE", body: object | null, success: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(api.endpoint(pub.id), {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "L'action n'a pas abouti");
        return false;
      }
      toast.success(success);
      return true;
    } catch {
      toast.error("Connexion impossible, réessayez");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string, success: string) {
    if (await send("PATCH", { status }, success)) onChanged();
  }

  async function confirmPending() {
    if (pending === "retire") {
      if (await send("PATCH", { status: "ARCHIVED" }, "Publication retirée")) onChanged();
    } else if (pending === "delete") {
      if (await send("DELETE", null, "Publication supprimée")) onDeleted();
    }
    setPending(null);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone="brand">{typeLabel(pub)}</StatusChip>
        {pub.state !== "active" && <StatusChip tone={STATE_TONE[pub.state]}>{STATE_LABEL[pub.state]}</StatusChip>}
        {pub.isOwn && <StatusChip>Ma publication</StatusChip>}
        {expiry && (
          <span className={`text-sm font-medium ${expiry.soon ? "text-warning" : "text-ink-muted"}`}>{expiry.label}</span>
        )}
      </div>

      {pub.state !== "active" && <Alert tone="info">{STATE_NOTICE[pub.state]}</Alert>}
      {renewalUntil && (
        <Alert
          tone="warning"
          action={
            <Button size="sm" disabled={busy} onClick={async () => { if (await send("PATCH", { renew: true }, "Offre confirmée")) onChanged(); }}>
              Toujours d&apos;actualité
            </Button>
          }
        >
          Sans confirmation, cette offre sera retirée automatiquement le {longDate(renewalUntil.toISOString())}.
        </Alert>
      )}

      <dl className="grid gap-3 sm:grid-cols-2">
        {pub.organization && (
          <DetailField label={pub.kind === "OFFER" ? "Entreprise" : pub.kind === "SEEKER" ? "Secteur" : "Domaine"}>
            {pub.organization}
          </DetailField>
        )}
        {(pub.location || pub.modality || pub.remote) && (
          <DetailField label="Lieu">
            {[pub.location, pub.modality ? MODALITY_LABEL[pub.modality] : null, pub.remote ? "Télétravail possible" : null]
              .filter(Boolean)
              .join(" · ")}
          </DetailField>
        )}
        {pub.kind === "SEEKER" && pub.contractTypes.length > 0 && (
          <DetailField label="Recherche">{pub.contractTypes.map((t) => CHIP_LABEL[t]).join(", ")}</DetailField>
        )}
        {pub.duration && <DetailField label="Durée">{pub.duration}</DetailField>}
        {pub.deadline && pub.kind === "OFFER" && <DetailField label="Date limite">{longDate(pub.deadline)}</DetailField>}
        {pub.availableFrom && <DetailField label="Disponible à partir du">{longDate(pub.availableFrom)}</DetailField>}
        {rate && <DetailField label={pub.kind === "MISSION" ? "Budget" : "Tarif"}>{rate}</DetailField>}
        <DetailField label="Publié par">
          {pub.author.name}, le {longDate(pub.createdAt)}
        </DetailField>
      </dl>

      <p className="whitespace-pre-wrap break-words text-[15px] leading-[22px] text-ink">{pub.description}</p>

      {(pub.contactEmail || pub.contactUrl) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold leading-[18px] text-ink-subtle">{isOpportunity ? "Candidature" : "Contact"}</h3>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {pub.contactEmail && (
              <a href={`mailto:${pub.contactEmail}`} className={buttonClasses("primary")}>
                <Mail aria-hidden="true" className="size-4" />
                Écrire par email
              </a>
            )}
            {pub.contactUrl && /^https?:\/\//i.test(pub.contactUrl) && (
              <a href={pub.contactUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses(pub.contactEmail ? "secondary" : "primary")}>
                <ExternalLink aria-hidden="true" className="size-4" />
                {isOpportunity ? "Postuler en ligne" : "Voir le profil en ligne"}
              </a>
            )}
          </div>
        </div>
      )}

      {canAct && (
        <ActionRow>
          {pub.isOwn && (pub.kind === "OFFER" ? !isRetired : pub.state === "active") && (
            <Link href={api.edit(pub.id)} className={buttonClasses("secondary")}>
              Modifier
            </Link>
          )}
          {pub.isOwn && close && pub.state === "active" && (
            <Button variant="secondary" disabled={busy} onClick={() => setStatus(close.status, close.done)}>
              {close.close}
            </Button>
          )}
          {pub.isOwn && close && pub.state === close.state && (
            <Button variant="secondary" disabled={busy} onClick={() => setStatus("ACTIVE", close.reopened)}>
              {close.reopen}
            </Button>
          )}
          {canRetire && !isRetired && (
            <Button variant="secondary" disabled={busy} onClick={() => setPending("retire")}>
              Retirer
            </Button>
          )}
          {canRetire && isRetired && (
            <Button variant="secondary" disabled={busy} onClick={() => setStatus(api.active, "Publication remise en ligne")}>
              Republier
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => setPending("delete")}>
            Supprimer
          </Button>
        </ActionRow>
      )}

      <ConfirmModal
        open={pending !== null}
        title={pending === "delete" ? "Supprimer la publication ?" : "Retirer la publication ?"}
        message={
          pending === "delete"
            ? "Elle sera supprimée définitivement, pour tout le monde."
            : "Elle n'apparaîtra plus dans la liste. Elle pourra être republiée."
        }
        confirmLabel={pending === "delete" ? "Supprimer" : "Retirer"}
        variant={pending === "delete" ? "danger" : "primary"}
        confirming={busy}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
