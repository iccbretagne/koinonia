import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const planningSchema = z.object({
  plannings: z.array(
    z.object({
      memberId: z.string(),
      status: z
        .enum(["EN_SERVICE", "EN_SERVICE_DEBRIEF", "REMPLACANT"])
        .nullable(),
    })
  ),
});

export const contract = defineContract({
  GET: {
    summary: "Grille de planning d'un département pour un événement",
    description: "Membres du département avec leur statut de service, disponibilités déclarées, désistements en attente (spec 061) et compteurs. Sans rattachement du département à l'événement, les statuts sont vides.",
    access: "planning:view",
    accessNote: "borné au périmètre départemental ; le département doit appartenir à l'église de l'événement",
    response: "Rattachement, membres avec statut et disponibilité, échéance (`deadlinePassed`, `canBypassDeadline`), compteurs, désistements, `canAskTeam`, `manualRelanceAvailable`",
  },
  PUT: {
    summary: "Enregistrement du planning d'un département",
    description: "Crée le rattachement département-événement si besoin. Après l'échéance de planification, seuls Super Admin, Admin et Secrétaire peuvent modifier (403 sinon). Un seul `EN_SERVICE_DEBRIEF` par département et événement (400), et les membres doivent appartenir au département. Placer quelqu'un pourvoit un désistement en attente (spec 061) ; les STAR dont le service change sont prévenus par récapitulatif différé (spec 060). Journalisé.",
    access: "planning:edit",
    accessNote: "borné au périmètre départemental",
    body: planningSchema,
    response: "Liste des plannings enregistrés",
  },
});
