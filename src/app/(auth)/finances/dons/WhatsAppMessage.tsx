"use client";

import { useEffect, useState } from "react";
import { Copy, MessageCircle, Share2 } from "lucide-react";
import type { GivingPageContent } from "@/modules/giving/schemas";
import { Alert, Button, Modal, Textarea, useToast } from "@/components/ui";
import { buttonClasses } from "@/components/ui/button-classes";
import { DEFAULT_SIGNATURE, buildWhatsAppMessage, whatsAppShareUrl } from "./whatsapp-message";

const MESSAGE_ID = "giving-whatsapp-message";
const signatureKey = (churchId: string) => `koinonia-giving-signature-${churchId}`;

function readSignature(churchId: string): string {
  try {
    return globalThis.localStorage?.getItem(signatureKey(churchId)) ?? DEFAULT_SIGNATURE;
  } catch {
    return DEFAULT_SIGNATURE;
  }
}

function writeSignature(churchId: string, value: string) {
  try {
    globalThis.localStorage?.setItem(signatureKey(churchId), value);
  } catch {
    // Stockage indisponible (navigation privée) : la signature n'est simplement pas retenue.
  }
}

/**
 * Générateur du message WhatsApp « Dîmes / Offrandes », à partir de la page de dons
 * enregistrée. Le message reste modifiable avant copie ; la signature est retenue sur cet
 * appareil, pour cette église.
 */
export default function WhatsAppMessage({
  churchId,
  content,
  publicUrl,
  dirty,
}: {
  readonly churchId: string;
  /** Contenu enregistré (et non le brouillon) : le message reflète ce que voient les gens. */
  readonly content: GivingPageContent;
  /** Adresse de la page publique, seulement si elle est publiée. */
  readonly publicUrl: string | null;
  readonly dirty: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [signature, setSignature] = useState(DEFAULT_SIGNATURE);
  const [message, setMessage] = useState("");

  const hasMeans = Boolean(
    (content.transferEnabled && content.beneficiary && content.iban) ||
      (content.onlineEnabled && content.onlineUrl) ||
      (content.onsiteEnabled && content.checkPayee)
  );

  function regenerate(nextSignature: string) {
    setMessage(buildWhatsAppMessage(content, { publicUrl, signature: nextSignature }));
  }

  function openModal() {
    const stored = readSignature(churchId);
    setSignature(stored);
    setMessage(buildWhatsAppMessage(content, { publicUrl, signature: stored }));
    setOpen(true);
  }

  useEffect(() => {
    if (open) writeSignature(churchId, signature);
  }, [open, churchId, signature]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Message copié");
    } catch {
      (document.getElementById(MESSAGE_ID) as HTMLTextAreaElement | null)?.select();
      toast.info("Le message est sélectionné : copie-le avec le menu de ton appareil.");
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={openModal}>
        <MessageCircle aria-hidden="true" className="size-4" />
        Message WhatsApp
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Message WhatsApp" size="lg">
        <div className="flex flex-col gap-4">
          {dirty && (
            <Alert tone="info" title="Modifications non enregistrées.">
              Le message reprend la version enregistrée de la page.
            </Alert>
          )}
          {hasMeans ? null : (
            <Alert tone="warning" title="Aucun moyen de don affiché.">
              Active le virement, le don en ligne ou « Sur place » pour qu&apos;ils apparaissent dans le message.
            </Alert>
          )}
          <Textarea
            label="Signature"
            rows={2}
            value={signature}
            onChange={(e) => {
              setSignature(e.target.value);
              regenerate(e.target.value);
            }}
            hint="Retenue sur cet appareil. La modifier régénère le message."
          />
          <Textarea
            id={MESSAGE_ID}
            label="Message"
            rows={14}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            hint="Les *astérisques* mettent le texte en gras dans WhatsApp. Le message reste modifiable avant de le copier."
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => regenerate(signature)}>
              Régénérer
            </Button>
            <a href={whatsAppShareUrl(message)} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary")}>
              <Share2 aria-hidden="true" className="size-4" />
              Ouvrir dans WhatsApp
            </a>
            <Button onClick={copy}>
              <Copy aria-hidden="true" className="size-4" />
              Copier le message
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
