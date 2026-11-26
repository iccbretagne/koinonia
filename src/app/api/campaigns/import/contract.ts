import { defineContract } from "@/lib/openapi/contract";
import { importBodySchema } from "@/modules/campaigns/schemas";

export { importBodySchema };

export const contract = defineContract({
  POST: {
    summary: "Import d'une définition de campagne (aperçu ou application)",
    description:
      "Définition `koinonia.campaign` version 1, validée (schéma puis contrôles sémantiques : 400 avec la liste des erreurs). `dryRun` (par défaut) renvoie l'aperçu sans rien écrire : campagne, questionnaires et destinataires créés, modifiés, inchangés ou supprimés, répondants retrouvés (comptes ayant un rôle dans l'église) ou non, modifications refusées. Application dans une seule transaction, idempotente par (église, clé) ; refusée (409) si une modification ferait perdre des réponses (question supprimée, type changé, choix ou champ de groupe utilisé retiré, destinataire supprimé). Les répondants sont ajoutés, jamais retirés ; l'état de la campagne n'est pas modifié. Campagne ouverte : les répondants ajoutés sont prévenus. Journalisé, sans valeur.",
    access: "campaigns:manage",
    accessNote:
      "création : `campaigns:manage` dans l'église courante (l'auteur devient gestionnaire) ; mise à jour d'une campagne existante de l'église courante (même clé) : gestionnaire de cette campagne",
    body: importBodySchema,
    response: "Aperçu de l'import (`ImportPreview`), avec `campaignId` et `applied`",
  },
});
