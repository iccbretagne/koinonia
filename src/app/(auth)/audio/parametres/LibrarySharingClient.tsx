"use client";

import { useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

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
  ownSlug: string;
  initialShares: Share[];
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
    <div className="mt-8 pt-6 border-t-2 border-gray-100">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Partage de ma bibliothèque</h2>
      <p className="text-sm text-gray-500 mb-4">
        Votre identifiant public :{" "}
        <span className="font-mono font-semibold text-icc-violet">{ownSlug}</span>. Communiquez-le
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
          disabled={submitting || !slug.trim()}
          onClick={handleResolve}
        >
          Vérifier et ouvrir
        </Button>
      </div>

      {error && <p className="text-sm text-icc-rouge mb-4">{error}</p>}

      {shares.length === 0 ? (
        <p className="text-sm text-gray-400">Aucune église n&apos;a accès à votre bibliothèque pour l&apos;instant.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border-2 border-gray-100 rounded-lg overflow-hidden">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-gray-900">{s.churchName}</p>
                <p className="text-xs text-gray-400">{s.churchSlug}</p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setRevokeTarget(s)}>
                Révoquer
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={confirmChurchName !== null}
        onClose={() => setConfirmChurchName(null)}
        title="Confirmer l'ouverture de la bibliothèque"
      >
        <p className="text-sm text-gray-700 mb-6">
          Vous êtes sur le point d&apos;ouvrir votre bibliothèque à{" "}
          <span className="font-semibold">{confirmChurchName}</span>. Ses membres pourront
          réécouter tous vos cultes publiés. Confirmez-vous ?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmChurchName(null)} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Ouverture…" : "Confirmer"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title="Révoquer ce partage"
      >
        <p className="text-sm text-gray-700 mb-6">
          <span className="font-semibold">{revokeTarget?.churchName}</span> perdra
          immédiatement l&apos;accès à votre bibliothèque. Confirmez-vous ?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setRevokeTarget(null)} disabled={submitting}>
            Annuler
          </Button>
          <Button variant="danger" onClick={handleRevoke} disabled={submitting}>
            {submitting ? "Révocation…" : "Révoquer"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
