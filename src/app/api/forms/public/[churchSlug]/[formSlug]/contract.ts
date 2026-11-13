import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Formulaire à remplir",
    description:
      "Formulaire publié qui accepte des réponses : questions, choix et places restantes. Inexistant, autre église, brouillon, clôturé, supprimé, pas encore ouvert, fin des réponses passée ou nombre maximal atteint : 404, même message « non disponible ». Réservé aux comptes connectés : 401 sans session, 404 pour un compte d'une autre église. Pour un compte, indique sa réponse existante (ou, pour un sondage anonyme, seulement qu'il a déjà répondu).",
    access: "public",
    response: "Formulaire public",
  },
});
