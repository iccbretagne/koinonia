import type { KnowledgeEntry } from "./types";

/** 6. Demandes (KB-080 à KB-085). */
export const DEMANDES: readonly KnowledgeEntry[] = [
  {
    key: "KB-080",
    kind: "howto",
    title: "Demander une annonce ou un visuel",
    questions: [
      "Faire passer une annonce",
      "demander une affiche",
      "visuel pour un événement",
      "poster sur les réseaux",
      "demande à la com",
    ],
    answer:
      "Dans « Mes demandes », touchez « Nouvelle demande » : renseignez le titre, le brief, la date limite et les canaux (annonce interne, réseaux sociaux, visuel).",
    href: "/requests/new",
    hrefLabel: "Nouvelle demande",
    audience: { permissions: ["members:view"] },
    otherwise: "Un STAR fait passer sa demande d'annonce ou de visuel par son responsable de département.",
    screens: ["/requests", "/media", "/communication"],
  },
  {
    key: "KB-081",
    kind: "howto",
    title: "Suivre mes demandes",
    questions: ["Où en est ma demande ?", "ma demande est refusée pourquoi", "statut de ma demande", "suivre mes demandes"],
    answer: "« Mes demandes » affiche l'état de chacune : En attente, En cours, Livrée, Refusée (avec le motif).",
    href: "/requests",
    hrefLabel: "Mes demandes",
    audience: { permissions: ["members:view"] },
    screens: ["/requests"],
  },
  {
    key: "KB-082",
    kind: "howto",
    title: "Traiter les demandes (Secrétariat)",
    questions: ["Demandes à traiter", "approuver une demande", "refuser une demande", "file du secrétariat"],
    answer:
      "« Traitement des demandes » a trois onglets (À traiter, En cours, Traitées) et une file triée par échéance. Ouvrez une demande pour l'approuver, la refuser avec un motif ou marquer une annonce diffusée.",
    href: "/secretariat/requests",
    hrefLabel: "Traitement des demandes",
    audience: { permissions: ["events:manage"], predicates: ["secretariatTeam"] },
    otherwise: "Le traitement des demandes revient au Secrétariat et à l'administration de l'église.",
    screens: ["/secretariat"],
  },
  {
    key: "KB-083",
    kind: "howto",
    title: "Traiter les demandes de visuels ou réseaux sociaux",
    questions: ["Demandes de visuels", "livrer un visuel", "demandes réseaux sociaux", "marquer publiée"],
    answer:
      "Dans « Communication & Production », ouvrez Visuels (onglet Demandes) ou Réseaux sociaux : prenez en charge, puis marquez livré ou publié (avec le lien si besoin). Une annulation demande un motif, transmis au demandeur.",
    href: "/media",
    hrefLabel: "Communication & Production",
    audience: { permissions: ["events:manage"], predicates: ["mediaTeam"] },
    otherwise: "Ces demandes sont traitées par les équipes Production Média et Communication.",
    screens: ["/media", "/communication"],
  },
  {
    key: "KB-084",
    kind: "howto",
    title: "Partager des photos",
    questions: ["Partager les photos du culte", "lien de partage", "envoyer les photos", "révoquer un lien"],
    answer:
      "Depuis Photos ou Visuels, « Partager une sélection » crée un lien. Le bouton « Partages » liste les liens actifs et permet de les révoquer.",
    href: "/media",
    hrefLabel: "Communication & Production",
    audience: { permissions: ["media:view"], predicates: ["mediaTeam"] },
    otherwise: "Le partage des photos revient aux équipes Photos et Production Média.",
    screens: ["/media"],
  },
  {
    key: "KB-085",
    kind: "howto",
    title: "Demander un rendez-vous pastoral",
    questions: [
      "Voir un pasteur",
      "rendez-vous avec le pasteur",
      "parler à un responsable",
      "besoin d'un accompagnement",
    ],
    answer:
      "Déposez la demande depuis la tuile « Rendez-vous pastoral » de « Mes demandes » (ou le lien « Demande RDV pastoral » pour un STAR). Suivez ensuite son état au même endroit.",
    href: "/care/request",
    hrefLabel: "Demande de rendez-vous pastoral",
    audience: { permissions: ["planning:view"] },
    screens: ["/requests", "/accueil"],
  },
];
