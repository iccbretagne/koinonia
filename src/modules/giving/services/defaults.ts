import type { GivingPageContent } from "../schemas";

/**
 * Contenu proposé à une église qui n'a jamais configuré sa page (spec 065) : textes repris des
 * maquettes, modifiables, page désactivée. Aucun texte pour le reçu fiscal, qui dépend du statut
 * juridique de chaque église. Rien n'est stocké tant que l'église n'a pas enregistré.
 */
export function defaultGivingContent(churchName: string): GivingPageContent {
  return {
    enabled: false,
    intro: "Dîmes, offrandes et dons : tous les moyens de donner, disponibles à tout moment depuis ton téléphone.",
    onlineEnabled: false,
    onlineUrl: null,
    onlineDescription: "Le moyen le plus simple. Don ponctuel ou mensuel, paiement sécurisé.",
    onlineNote: "Carte bancaire · prélèvement automatique possible",
    transferEnabled: false,
    beneficiary: churchName,
    iban: null,
    bic: null,
    transferReference: "OFFRANDE/DÎMES – Prénom Nom",
    onsiteEnabled: false,
    checkPayee: churchName,
    onsiteText:
      "Chèques et espèces se déposent dans l'enveloppe remise par l'accueil. Indique ton nom dessus pour recevoir ton reçu fiscal.",
    taxReceiptEnabled: false,
    taxReceiptText: null,
    verseText:
      "Que chacun donne selon ce qu'il a résolu dans son cœur, non à regret ni par contrainte ; car Dieu aime celui qui donne avec joie.",
    verseReference: "2 Corinthiens 9:7",
    contactEmail: null,
    address: null,
    socialHandle: null,
    shortUrl: null,
    pageChurchNameShown: true,
    pageChurchNameSize: "SMALL",
    slideChurchNameShown: true,
    slideChurchNameSize: "SMALL",
    pageLogoShown: true,
    slideLogoShown: true,
  };
}
