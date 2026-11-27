import { ALL, type KnowledgeEntry } from "./types";
import { paths, PREFIXES } from "@/lib/paths";

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
      "Dans « Mes demandes », section « Demandes comptables », déposez une note de frais (dépense faite) ou une avance de budget (dépense à venir), avec les justificatifs. Suivez ensuite son traitement au même endroit.",
    href: paths.accounting.newRequest(),
    hrefLabel: "Nouvelle demande financière",
    audience: { permissions: ["accounting:submit"], predicates: ["pastoral"] },
    otherwise:
      "Les demandes financières sont déposées par les responsables de département et les Ministres : un STAR passe par son responsable. Pour une dépense de la navette, l'équipe navette la déclare dans « Navette ».",
    screens: [PREFIXES.accounting],
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
      "Dans « Finances » › « Demandes comptables », ouvrez la demande pour la valider avec son plan de paiement ou la refuser avec un motif, puis confirmez chaque remise de fonds. « Payé depuis » indique si l'argent sort du compte commun ou d'une caisse de la trésorerie (repris alors automatiquement).",
    href: paths.accounting.requests(),
    hrefLabel: "Comptabilité",
    audience: { permissions: ["accounting:manage"] },
    otherwise: "Le traitement des demandes financières revient au Comptable.",
    screens: [PREFIXES.accounting],
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
    href: paths.accounting.requests(),
    hrefLabel: "Mes demandes comptables",
    audience: { permissions: ["accounting:submit"], predicates: ["pastoral"] },
    otherwise: "Les justificatifs sont déposés par la personne qui a demandé l'avance.",
    screens: [PREFIXES.accounting],
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
      "Dans « Finances » › « Demandes comptables », le compteur « À justifier » liste les retards, les factures à vérifier et les reliquats. Sur la demande, acceptez, renvoyez avec un motif, ou dispensez avec le montant retenu ; confirmez la restitution d'un reliquat avec « Rendu sur » (une caisse l'ajoute à la trésorerie). Les délais de relance se règlent en bas de la liste. Pour une avance versée avant la mise en service, le filtre « Arriéré » permet de réclamer les justificatifs.",
    href: paths.accounting.requests(),
    hrefLabel: "Comptabilité",
    audience: { permissions: ["accounting:manage"] },
    otherwise: "La vérification des justificatifs revient au Comptable.",
    screens: [PREFIXES.accounting],
  },
  {
    key: "KB-152",
    kind: "howto",
    title: "Demander une pièce manquante à un demandeur",
    questions: [
      "relancer un demandeur",
      "demander une facture",
      "pièce jointe manquante",
      "réclamer une pièce",
      "la pièce jointe a disparu",
      "relancer pour le justificatif de la navette",
    ],
    answer:
      "Sur la demande, cliquez sur « Demander une pièce » et ajoutez un message si besoin : le demandeur est prévenu et peut déposer une ou plusieurs pièces, même si la demande est déjà en traitement ou validée. Vous êtes prévenu au dépôt. Sans réponse, le même bouton devient « Relancer le demandeur » (dates et nombre de relances affichés) ; « Annuler la demande de pièce » retire la mention. Le filtre « Pièce demandée » de la liste regroupe les demandes en attente. Pour la navette, ouvrez la ligne et cliquez sur « Demander le justificatif ».",
    href: paths.accounting.requests(),
    hrefLabel: "Comptabilité",
    audience: { permissions: ["accounting:manage"] },
    otherwise: "Seule la comptabilité peut demander une pièce sur une demande.",
    screens: [PREFIXES.accounting],
  },
  {
    key: "KB-153",
    kind: "howto",
    title: "Déposer la pièce demandée par la comptabilité",
    questions: [
      "la compta me demande une pièce",
      "ajouter une facture à ma demande",
      "je ne peux plus ajouter de pièce jointe",
      "redéposer mon justificatif",
      "pièce demandée",
    ],
    answer:
      "Ouvrez la demande depuis la notification ou « Mes demandes comptables » : l'encart « Pièce demandée » reprend le message de la comptabilité. Choisissez une ou plusieurs pièces (JPEG, PNG ou PDF, 5 Mo chacune) et envoyez : la comptabilité est prévenue. Sans demande de la comptabilité, on ne peut ajouter une pièce que tant que la demande est « Soumise ». Pour un justificatif de la navette demandé, ouvrez la ligne dans « Navette ».",
    href: paths.accounting.requests(),
    hrefLabel: "Mes demandes comptables",
    audience: { permissions: ["accounting:submit"], predicates: ["shuttleTeam"] },
    otherwise: "Seul l'auteur de la demande peut y déposer la pièce demandée.",
    screens: [PREFIXES.accounting],
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
    href: paths.accounting.tresorerie({ onglet: "collecte" }),
    hrefLabel: "Trésorerie",
    audience: { permissions: ["treasury:manage"] },
    otherwise: TREASURY_OTHERWISE,
    screens: [paths.accounting.tresorerie()],
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
    href: paths.accounting.tresorerie({ onglet: "remise" }),
    hrefLabel: "Trésorerie",
    audience: { permissions: ["treasury:manage"] },
    otherwise: TREASURY_OTHERWISE,
    screens: [paths.accounting.tresorerie()],
  },
  {
    key: "KB-104",
    kind: "howto",
    title: "Clôturer le mois",
    questions: ["Clôturer le mois", "fermer octobre", "rouvrir un mois", "erreur sur un mois clôturé"],
    answer:
      "Dans « Trésorerie », onglet « Clôture », vérifiez les soldes du mois écoulé puis clôturez : ses lignes ne se modifient plus. Pour corriger un mois clôturé, un Admin le rouvre avec un motif.",
    href: paths.accounting.tresorerie({ onglet: "cloture" }),
    hrefLabel: "Trésorerie",
    audience: { permissions: ["treasury:manage"] },
    otherwise: TREASURY_OTHERWISE,
    screens: [paths.accounting.tresorerie()],
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
    href: paths.accounting.navette(),
    hrefLabel: "Navette",
    audience: { permissions: ["shuttle:manage"], predicates: ["shuttleTeam"] },
    otherwise:
      "La navette est réservée à l'équipe navette et à la comptabilité ; faire partie du département Navette donne ces droits.",
    screens: [paths.accounting.navette()],
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
    href: paths.dons(),
    hrefLabel: "Page de dons",
    audience: { permissions: ["giving:manage"] },
    otherwise: "La page de dons est paramétrée par le Comptable, le Secrétaire et l'administration de l'église.",
    screens: [paths.dons()],
  },
];
