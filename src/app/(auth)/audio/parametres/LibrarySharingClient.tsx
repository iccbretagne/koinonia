"use client";

import { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";

interface Share {
  id: string;
  churchName: string;
  churchSlug: string;
  createdAt: string;
}

/**
 * Section « Partage de ma bibliothèque » des paramètres Audio (spec 036). Aucune liste
 * d'églises n'est jamais proposée : l'identifiant est saisi à la main, transmis hors
 * application par l'église destinataire.
 */
export default function LibrarySharingClient({
  ownSlug,
  initialShares,
}: {
  readonly ownSlug: string;
  readonly initialShares: Share[];
}) {
  const [shares, setShares] = useState<Share[]>(initialShares);
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmChurchName, setConfirmChurchName] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Share | null>(null);

  async function handleResolve() {
    if (!slug.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/audio/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: slug.trim(), confirm: false }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Impossible de vérifier cet identifiant.");
      setConfirmChurchName(body.churchName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/audio/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: slug.trim(), confirm: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Impossible d'ouvrir la bibliothèque.");
      setShares((prev) => [
        { id: body.id, churchName: body.churchName, churchSlug: slug.trim(), createdAt: body.createdAt },
        ...prev,
      ]);
      setSlug("");
      setConfirmChurchName(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
      setConfirmChurchName(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/audio/shares/${revokeTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Impossible de révoquer ce partage.");
      }
      setShares((prev) => prev.filter((s) => s.id !== revokeTarget.id));
      setRevokeTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 pt-6 border-t-2 border-line">
      <h2 className="text-lg font-semibold text-ink mb-2">Partage de ma bibliothèque</h2>
      <p className="text-sm text-ink-muted mb-4">
        Votre identifiant public :{" "}
        <span className="font-mono font-semibold text-brand-text">{ownSlug}</span>. Communiquez-le
        à une église qui souhaite vous ouvrir sa bibliothèque — vos membres verront alors ses
        cultes publiés. Pour ouvrir la vôtre à une autre église, saisissez ci-dessous
        l&apos;identifiant qu&apos;elle vous a communiqué.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-6">
        <div className="flex-1 max-w-xs">
          <Input
            label="Identifiant de l'église à ouvrir"
            placeholder="identifiant-eglise"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={submitting || !slug.trim()}
          onClick={handleResolve}
        >
          Vérifier et ouvrir
        </Button>
      </div>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {shares.length === 0 ? (
        <p className="text-sm text-ink-subtle">Aucune église n&apos;a accès à votre bibliothèque pour l&apos;instant.</p>
      ) : (
        <ul className="divide-y divide-line border border-line rounded-card bg-surface overflow-hidden">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium text-ink">{s.churchName}</p>
                <p className="text-xs text-ink-subtle">{s.churchSlug}</p>
              </div>
              <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setRevokeTarget(s)}>
                Révoquer le partage
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={confirmChurchName !== null}
        variant="primary"
        title={`Ouvrir votre bibliothèque à ${confirmChurchName ?? ""} ?`}
        message="Ses membres pourront réécouter tous vos cultes publiés."
        confirmLabel="Ouvrir la bibliothèque"
        confirmingLabel="Ouverture en cours…"
        confirming={submitting}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmChurchName(null)}
      />

      <ConfirmModal
        open={revokeTarget !== null}
        title={`Révoquer le partage avec ${revokeTarget?.churchName ?? ""} ?`}
        message="Cette église perdra immédiatement l'accès à votre bibliothèque."
        confirmLabel="Révoquer le partage"
        confirmingLabel="Révocation en cours…"
        confirming={submitting}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
