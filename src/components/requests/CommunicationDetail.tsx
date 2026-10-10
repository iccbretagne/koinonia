"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ReasonForm from "./ReasonForm";
import { ActionRow, AnnouncementBlock, ChildrenBlock, DetailMeta, ExternalAnchor, ReviewBlock } from "./DetailBlocks";
import { textOf, type DetailContext, type QueueItem } from "./queue-types";

/**
 * Panneau de détail de la Communication (spec 063) : publication réseaux sociaux demandée avec une
 * annonce. Prendre en charge, puis marquer publiée (lien du post facultatif) ; annulation avec motif.
 */
export default function CommunicationDetail({ item, ctx }: { readonly item: QueueItem; readonly ctx: DetailContext }) {
  const [link, setLink] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const postLink = textOf(item.payload.deliveryLink);
  const isOpen = item.status === "EN_ATTENTE" || item.status === "EN_COURS";

  return (
    <>
      <DetailMeta item={item} doneLabel="Publiée" />
      <AnnouncementBlock item={item} />
      <ChildrenBlock item={item} />
      <ReviewBlock item={item} />
      {item.status === "LIVRE" && postLink && <ExternalAnchor href={postLink}>Voir le post publié</ExternalAnchor>}

      {isOpen && !cancelling && (
        <>
          {item.status === "EN_COURS" && (
            <Input
              type="url"
              label="Lien du post publié (facultatif)"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
            />
          )}
          <ActionRow>
            {item.status === "EN_ATTENTE" ? (
              <Button
                disabled={ctx.busy}
                onClick={() => ctx.act({ status: "EN_COURS" }, { success: "Publication prise en charge", undo: { status: "EN_ATTENTE" } })}
              >
                Prendre en charge
              </Button>
            ) : (
              <Button
                disabled={ctx.busy}
                onClick={() =>
                  ctx.act(
                    { status: "LIVRE", ...(link.trim() ? { deliveryLink: link.trim() } : {}) },
                    { success: "Publication marquée publiée", undo: { status: "EN_COURS" } }
                  )
                }
              >
                Marquer publiée
              </Button>
            )}
            <Button variant="ghost" disabled={ctx.busy} onClick={() => setCancelling(true)}>
              Annuler la publication
            </Button>
          </ActionRow>
        </>
      )}

      {cancelling && (
        <ReasonForm
          label="Motif de l'annulation"
          confirmLabel="Annuler la publication"
          warning={
            item.children.some((c) => c.status === "EN_ATTENTE" || c.status === "EN_COURS")
              ? "Le visuel demandé pour cette publication sera aussi annulé."
              : undefined
          }
          busy={ctx.busy}
          onCancel={() => setCancelling(false)}
          onConfirm={(reason) => void ctx.act({ status: "ANNULE", reviewNotes: reason }, { success: "Publication annulée" })}
        />
      )}
    </>
  );
}
