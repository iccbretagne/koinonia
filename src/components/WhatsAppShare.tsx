"use client";

import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { whatsAppShareUrl } from "@/lib/whatsapp";

/**
 * Partage d'un message : « WhatsApp » ouvre WhatsApp avec le texte prêt à envoyer (le destinataire
 * se choisit dans l'application), l'icône à côté le copie pour un autre usage. Le texte est
 * composé au clic. Sans presse-papier (contexte non sécurisé), il s'affiche pour une copie manuelle.
 */
export default function WhatsAppShare({
  text,
  getText = () => text ?? "",
  copiedMessage = "Message copié",
  size = "md",
}: {
  /** Message déjà composé (depuis un composant serveur). */
  readonly text?: string;
  /** Ou composé au clic (contenu qui change à l'écran). */
  readonly getText?: () => string;
  /** Confirmation après la copie : « Message copié : 4 opportunités ». */
  readonly copiedMessage?: string;
  readonly size?: "sm" | "md";
}) {
  const toast = useToast();
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  function share() {
    globalThis.open(whatsAppShareUrl(getText()), "_blank", "noopener,noreferrer");
  }

  async function copy() {
    const text = getText();
    try {
      if (!navigator.clipboard) throw new Error("presse-papier indisponible");
      await navigator.clipboard.writeText(text);
      toast.success(copiedMessage);
    } catch {
      setFallbackText(text);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button type="button" variant="secondary" size={size} onClick={share}>
        <MessageCircle aria-hidden="true" className="size-4" />
        WhatsApp
      </Button>
      <IconButton icon={Copy} aria-label="Copier le message" size={size} onClick={() => void copy()} />
      <Modal open={fallbackText !== null} onClose={() => setFallbackText(null)} title="Copier le message">
        <p className="mb-3 text-sm text-ink-muted">
          La copie automatique n&apos;a pas fonctionné. Sélectionnez le texte ci-dessous et copiez-le manuellement.
        </p>
        <textarea
          readOnly
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={fallbackText ?? ""}
          rows={12}
          aria-label="Message à copier"
          className="w-full rounded-control border border-control-line bg-surface p-2 font-mono text-xs text-ink focus:border-brand focus:outline-none"
        />
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setFallbackText(null)}>
            Fermer
          </Button>
        </div>
      </Modal>
    </span>
  );
}
