import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Téléchargement d'un fichier de campagne",
    description:
      "Spec 090. Servi par Koinonia, jamais d'adresse signée : `Content-Disposition: attachment`, `nosniff`, `no-store`. Droits revérifiés sur l'affectation du fichier à chaque appel. Journalisé sans nom de fichier.",
    access: "session",
    accessNote: "répondant de l'affectation ou gestionnaire de la campagne",
    response: "Contenu du fichier",
    responseType: "application/octet-stream",
  },
  DELETE: {
    summary: "Retrait d'un fichier de campagne",
    description:
      "Spec 090. Répondant tant que la saisie est ouverte (409 sinon), gestionnaire tant que la campagne n'est pas clôturée. Objet supprimé du stockage. Journalisé.",
    access: "session",
    accessNote: "répondant de l'affectation ou gestionnaire de la campagne",
    response: "`{ deleted: true }`",
  },
});
