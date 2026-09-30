"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";

interface Props {
  /** Route `DELETE` de l'objet. */
  readonly endpoint: string;
  /** Liste vers laquelle revenir après suppression. */
  readonly redirectTo: string;
  /** Précision ajoutée au message de confirmation (ex. entrée d'agenda supprimée aussi). */
  readonly extraMessage?: string;
  /** Suppression impossible tant que ces éléments liés existent (spec 057). */
  readonly blockedBy?: readonly { readonly label: string; readonly href: string }[];
}

/** Suppression définitive d'une demande ou d'un suivi (spec 057), réservée à `care:delete`/`integration:delete`. */
export default function DeleteItemButton({ endpoint, redirectTo, extraMessage, blockedBy = [] }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const blocked = blockedBy.length > 0;

  async function confirmDelete() {
    setDeleting(true);
    const res = await fetch(endpoint, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "La suppression a échoué. Réessayez.");
      setDeleting(false);
      setOpen(false);
      router.refresh();
      return;
    }
    toast.success("Demande supprimée.");
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        Supprimer
      </Button>

      {blocked ? (
        <Modal open={open} onClose={() => setOpen(false)} title="Suppression impossible" mobileLayout="sheet">
          <div className="flex flex-col gap-4">
            <p className="text-[15px] leading-[22px] text-ink-muted">
              Cette demande a des éléments liés. Supprimez-les d&apos;abord, puis revenez ici.
            </p>
            <ul className="space-y-1.5">
              {blockedBy.map((b) => (
                <li key={b.href}>
                  <Link href={b.href} className="text-sm text-brand-text hover:underline">
                    {b.label} →
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex justify-end pt-1">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </Modal>
      ) : (
        <ConfirmModal
          open={open}
          title="Supprimer définitivement cette demande ?"
          message={`Les coordonnées, le message, l'historique et les notifications de la demande seront effacés. Cette action est irréversible.${extraMessage ? ` ${extraMessage}` : ""}`}
          confirmLabel="Supprimer"
          confirmingLabel="Suppression…"
          confirming={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
