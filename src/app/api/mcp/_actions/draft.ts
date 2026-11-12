import type { z } from "zod";
import type { AssistantViewer } from "@/core/assistant";
import { publicOrigin } from "@/modules/mcp";
import { requestPrefillHref, requestPrefillSchema } from "@/app/(auth)/requests/prefill";
import type { ActionResult } from "./common";

// ─── Préparer une demande (lien prérempli, rien n'est enregistré) ─────────────

export const draftRequestInput = requestPrefillSchema.extend({
  type: requestPrefillSchema.shape.type.describe("annonce, visuel ou evenement (demande d'ajout d'un événement)"),
  titre: requestPrefillSchema.shape.titre.describe("Titre de l'annonce, du visuel ou de l'événement"),
  texte: requestPrefillSchema.shape.texte.describe("Texte de l'annonce ou brief du visuel (ignoré pour un événement)"),
  date: requestPrefillSchema.shape.date.describe("AAAA-MM-JJ : date de l'événement annoncé, date limite du visuel ou date de l'événement à ajouter"),
  heure: requestPrefillSchema.shape.heure.describe("HH:MM, heure de l'événement à ajouter (10:00 par défaut)"),
  typeEvenement: requestPrefillSchema.shape.typeEvenement.describe("Type de l'événement à ajouter"),
});

const KIND_LABEL = { annonce: "annonce", visuel: "demande de visuel", evenement: "demande d'ajout d'événement" } as const;

/**
 * Brouillon de demande (spec 081, T38) : un lien vers « Nouvelle demande » prérempli. Rien n'est
 * enregistré ; la personne complète (départements, canaux…) et envoie elle-même dans Koinonia.
 */
export function draftRequest(input: z.infer<typeof draftRequestInput>): ActionResult {
  const link = `${publicOrigin()}${requestPrefillHref(input)}`;
  return {
    text:
      `Brouillon de ${KIND_LABEL[input.type]} prêt — rien n'est encore envoyé.
` +
      `La personne ouvre ce lien, complète le formulaire si besoin et l'envoie elle-même :
${link}`,
    structured: { done: false, action: "draft_request", link },
  };
}

/** Le formulaire « Nouvelle demande » exige `members:view` (même garde que la page). */
export const canDraftRequest = (viewer: AssistantViewer) => viewer.permissions.includes("members:view");

export const DRAFT_REQUEST_TOOL = {
  name: "draft_request",
  description:
    "Prépare une annonce, une demande de visuel ou une demande d'ajout d'événement sous forme de lien vers le formulaire de Koinonia prérempli. N'enregistre et n'envoie rien : la personne relit, complète et envoie elle-même.",
  input: draftRequestInput,
} as const;
