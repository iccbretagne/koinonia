import { ALL, type KnowledgeEntry } from "./types";

const TREASURY_OTHERWISE = "La trésorerie est réservée au Comptable et à l'administration de l'église.";

/** 7. Comptabilité, navette, trésorerie, dons (KB-100 à KB-109). */
export const FINANCES: readonly KnowledgeEntry[] = [
  {
    key: "KB-100",
    kind: "howto",
    title: "Faire une note de frais ou une avance",
    questions: [
      "Me faire rembourser",
      "note de frais",
      "avance de budget",
      "j'ai payé de ma poche",
      "demander de l'argent pour mon département",
    ],
    answer:
      "Dans « Comptabilité », déposez une note de frais (dépense faite) ou une avance de budget (dépense à venir), avec les justificatifs. Suivez ensuite son traitement au même endroit.",
    href: "/accounting/requests/new",
    hrefLabel: "Nouvelle demande financière",
    audience: { permissions: ["accounting:submit"], predicates: ["pastoral"] },
    otherwise:
      "Les demandes financières sont déposées par les responsables de département et les Ministres : un STAR passe par son responsable. Pour une dépense de la navette, l'équipe navette la déclare dans « Navette ».",
    screens: ["/accounting"],
  },
  {
    key: "KB-101",
    kind: "howto",
    title: "Traiter une demande financière",
    questions: [
      "Valider une note de frais",
      "payer une avance",
      "refuser une demande de compta",
      "confirmer un paiement",
    ],
    answer:
      "Dans « Comptabilité », ouvrez la demande pour la valider avec son plan de paiement ou la refuser avec un motif, puis confirmez chaque remise de fonds. « Payé depuis » indique si l'argent sort du compte commun ou d'une caisse de la trésorerie (repris alors automatiquement).",
    href: "/accounting/requests",
    hrefLabel: "Comptabilité",
    audience: { permissions: ["accounting:manage"] },
    otherwise: "Le traitement des demandes financières revient au Comptable.",
    screens: ["/accounting"],
  },
  {
    key: "KB-108",
    kind: "howto",
    title: "Déposer les factures d'une avance",
    questions: [
      "justifier une avance",
      "envoyer mes factures",
      "justificatifs attendus",
      "rendre le reliquat",
      "j'ai dépensé plus que l'avance",
      "relance justificatifs",
    ],
    answer:
      "Après la remise d'une avance (ou d'une note de frais payée sans pièce), ouvrez la demande : dans « Justificatifs », déposez vos factures et le montant total dépensé. S'il reste de l'argent, rendez le reliquat à la comptabilité ; si vous avez dépensé plus, « Demander le complément » prépare la note de frais. Vous êtes relancé chaque semaine tant que les factures manquent, et vos responsables sont prévenus à la 3e relance.",
    href: "/accounting/requests",
    hrefLabel: "Mes demandes comptables",
    audience: { permissions: ["accounting:submit"], predicates: ["pastoral"] },
    otherwise: "Les justificatifs sont déposés par la personne qui a demandé l'avance.",
    screens: ["/accounting"],
  },
  {
    key: "KB-109",
    kind: "howto",
    title: "Vérifier les justificatifs et les reliquats",
    questions: [
      "accepter les factures",
      "avances non justifiées",
      "confirmer un reliquat rendu",
      "dispenser de justificatif",
      "délai de relance des justificatifs",
      "réclamer les justificatifs des anciennes avances",
    ],
    answer:
      "Dans « Comptabilité », le compteur « À justifier » liste les retards, les factures à vérifier et les reliquats. Sur la demande, acceptez, renvoyez avec un motif, ou dispensez avec le montant retenu ; confirmez la restitution d'un reliquat avec « Rendu sur » (une caisse l'ajoute à la trésorerie). Les délais de relance se règlent en bas de la liste. Pour une avance versée avant la mise en service, le filtre « Arriéré » permet de réclamer les justificatifs.",
    href: "/accounting/requests",
    hrefLabel: "Comptabilité",
    audience: { permissions: ["accounting:manage"] },
    otherwise: "La vérification des justificatifs revient au Comptable.",
    screens: ["/accounting"],
  },
  {
    key: "KB-102",
    kind: "howto",
    title: "Saisir la collecte du culte",
    questions: [
      "Enregistrer les offrandes",
      "saisir les dîmes",
      "compter la quête",
      "collecte de dimanche",
      "chèques du culte",
    ],
    answer:
      "Dans « Trésorerie », onglet « Collecte » : choisissez le culte et la caisse, saisissez par catégorie le total des espèces et les chèques un par un, puis les deux personnes qui ont compté. « Enregistrer la collecte » crée les lignes dans la caisse.",
    href: "/accounting/tresorerie?onglet=collecte",
    hrefLabel: "Trésorerie",
    audience: { permissions: ["treasury:manage"] },
    otherwise: TREASURY_OTHERWISE,
    screens: ["/accounting/tresorerie"],
  },
  {
    key: "KB-103",
    kind: "howto",
    title: "Déposer à la banque (remise au compte commun)",
    questions: [
      "Déposer les chèques",
      "remise en banque",
      "bordereau",
      "vider la caisse",
      "chèques pas encore déposés",
    ],
    answer:
      "Dans « Trésorerie », onglet « Remise » : choisissez la caisse, la date et le numéro de bordereau, le montant des espèces, puis cochez les chèques remis. Les chèques non cochés restent en caisse.",
    href: "/accounting/tresorerie?onglet=remise",
    hrefLabel: "Trésorerie",
    audience: { permissions: ["treasury:manage"] },
    otherwise: TREASURY_OTHERWISE,
    screens: ["/accounting/tresorerie"],
  },
  {
    key: "KB-104",
    kind: "howto",
    title: "Clôturer le mois",
    questions: ["Clôturer le mois", "fermer octobre", "rouvrir un mois", "erreur sur un mois clôturé"],
    answer:
      "Dans « Trésorerie », onglet « Clôture », vérifiez les soldes du mois écoulé puis clôturez : ses lignes ne se modifient plus. Pour corriger un mois clôturé, un Admin le rouvre avec un motif.",
    href: "/accounting/tresorerie?onglet=cloture",
    hrefLabel: "Trésorerie",
    audience: { permissions: ["treasury:manage"] },
    otherwise: TREASURY_OTHERWISE,
    screens: ["/accounting/tresorerie"],
  },
  {
    key: "KB-105",
    kind: "howto",
    title: "Déclarer une dépense de la navette",
    questions: [
      "Plein d'essence de la navette",
      "dépense navette",
      "ticket de péage",
      "location du minibus",
      "justificatif navette",
    ],
    answer:
      "Dans « Navette », « Déclarer une dépense » : nature, montant, date et justificatif (photo ou document). La dépense compte aussitôt et la comptabilité est prévenue. Vous pouvez la corriger ou la supprimer pendant 48 heures. Payée de votre poche ? « Demander le remboursement » depuis la ligne.",
    href: "/accounting/navette",
    hrefLabel: "Navette",
    audience: { permissions: ["shuttle:manage"], predicates: ["shuttleTeam"] },
    otherwise:
      "La navette est réservée à l'équipe navette et à la comptabilité ; faire partie du département Navette donne ces droits.",
    screens: ["/accounting/navette"],
  },
  {
    key: "KB-106",
    kind: "howto",
    title: "Comment donner",
    questions: ["Comment donner ?", "IBAN de l'église", "faire un don", "donner la dîme", "virement à l'église"],
    answer:
      "La page publique « Donner » de votre église indique comment donner : en ligne, par virement, ou chèques et espèces dans l'enveloppe de l'accueil. Son adresse est diffusée par l'église (QR code projeté au culte, message WhatsApp).",
    audience: ALL,
    module: "giving",
  },
  {
    key: "KB-107",
    kind: "howto",
    title: "Paramétrer la page de dons",
    questions: ["Modifier la page de dons", "QR code des dons", "message WhatsApp dîmes", "slide des dons", "changer l'IBAN des dons"],
    answer:
      "Dans « Page de dons » : choisissez les sections affichées, les coordonnées et le verset, avec un aperçu en direct. L'onglet « Slide de projection » prépare le QR code, et un message WhatsApp est prêt à copier.",
    href: "/dons",
    hrefLabel: "Page de dons",
    audience: { permissions: ["giving:manage"] },
    otherwise: "La page de dons est paramétrée par le Comptable, le Secrétaire et l'administration de l'église.",
    screens: ["/dons"],
  },
];
