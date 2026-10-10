import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  action: z.enum(["approve", "reject", "reconsider"]),
  rejectReason: z.string().optional(),
  departmentId: z.string().optional(), // override admin si besoin
  confirmDuplicate: z.boolean().optional(),
});

export const contract = defineContract({
  PATCH: {
    summary: "Traitement d'une demande de liaison de compte",
    description:
      "`approve` : admet le compte dans l'église, lie ou crée la fiche STAR et attribue le rôle demandé ; `reject` : refuse, avec motif facultatif ; `reconsider` : repasse en attente une demande refusée. " +
      "409 si la demande est déjà traitée (ou n'est pas refusée pour `reconsider`). Avant de créer une nouvelle fiche, des doublons possibles renvoient 409 avec `{ duplicates }` tant que `confirmDuplicate` n'est pas vrai ; " +
      "un département est requis pour créer un STAR (400). Le demandeur est notifié de l'approbation et du refus. Journalisé.",
    access: "access:manage",
    accessNote: "dans l'église de la demande ; borné au périmètre (ministère ou départements) de l'appelant, y compris pour le département imposé (403 sinon)",
    body: schema,
    response: "`{ approved: true }` pour `approve`, sinon la demande mise à jour",
  },
});
