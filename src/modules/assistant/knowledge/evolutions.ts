import type { KnowledgeEntry } from "./types";
import { paths } from "@/lib/paths";

const CAMPAIGN_AUDIENCE = { predicates: ["campaignManager"], permissions: ["campaigns:manage"] } as const;
const CAMPAIGN_OTHERWISE = "Les campagnes de collecte sont pilotées par leurs gestionnaires et l'administration de l'église.";
const INTEGRATION_AUDIENCE = { permissions: ["integration:manage"], predicates: ["integrationTeam"] } as const;
const INTEGRATION_OTHERWISE = "L'intégration est suivie par l'équipe Intégration et l'administration.";

/** Vue pastorale (KB-178, KB-179). */
export const PASTORAL: readonly KnowledgeEntry[] = [
  {
    key: "KB-178",
    kind: "howto",
    title: "Retrouver un membre (vue pastorale)",
    questions: ["mes membres", "chercher un membre de l'église", "retrouver un membre", "liste des membres pour le pasteur", "annuaire des membres"],
    answer:
      "Dans l'espace « Personnes », « Mes membres » remplace « STAR » pour un profil pastoral : recherchez par nom, email ou département pour retrouver une personne de l'église.",
    href: paths.pastoral.members(),
    hrefLabel: "Mes membres",
    audience: { predicates: ["pastoral"] },
    otherwise: "« Mes membres » est la vue des profils pastoraux ; les autres rôles utilisent « Personnes » › « STAR » selon leurs droits.",
    screens: [paths.pastoral.members()],
  },
  {
    key: "KB-179",
    kind: "howto",
    title: "Lire les comptes rendus et les demandes comptables (vue pastorale)",
    questions: ["lire un compte rendu en tant que pasteur", "voir les demandes comptables du pasteur", "consulter les finances en lecture", "le pasteur peut-il modifier un compte rendu"],
    answer:
      "Un profil pastoral consulte « Comptes rendus » (espace « Événements ») et « Demandes comptables » (espace « Finances ») en lecture seule : pas d'ajout de pièces, pas d'export, pas de modification.",
    href: paths.admin.reports(),
    hrefLabel: "Comptes rendus",
    audience: { predicates: ["pastoral"] },
    otherwise: "Cette vue en lecture seule est celle des profils pastoraux ; les autres rôles ont les droits de leur espace.",
  },
];

/** Audio, production et paramètres (KB-180, KB-181). */
export const AUDIO: readonly KnowledgeEntry[] = [
  {
    key: "KB-180",
    kind: "howto",
    title: "Déposer et publier un culte (production audio)",
    questions: ["déposer un enregistrement", "publier un culte", "dépublier un culte", "découper un culte en séquences", "nommer les séquences d'un culte", "production audio"],
    answer:
      "Dans l'espace « Médias », « Audio » puis l'onglet « Production » : « Déposer un enregistrement » pour le culte, ou « Déposer des séquences audio ». Ordonnez et nommez les séquences puis « Enregistrer l'ordre et les noms ». « Publier le culte » le rend écoutable par toute l'église ; « Dépublier le culte » le retire (réservé aux responsables de la captation et à l'administration).",
    href: paths.audio.production(),
    hrefLabel: "Production audio",
    audience: { permissions: ["audio:view"] },
    otherwise: "La production audio est tenue par l'équipe de captation audio et l'administration ; tout le monde peut réécouter les cultes publiés.",
    screens: [paths.audio.production()],
  },
  {
    key: "KB-181",
    kind: "howto",
    title: "Régler l'audio (couverture, noms de séquences, partage)",
    questions: ["couverture par défaut des cultes", "modèle de noms de séquences", "partager la bibliothèque audio", "paramètres audio", "image des cultes"],
    answer:
      "Dans « Médias » › « Audio » › « Paramètres » : choisissez la « Couverture par défaut », saisissez le « Modèle de noms de séquences » (un nom par ligne) puis « Enregistrer les paramètres ». Vous pouvez aussi ouvrir la bibliothèque à une autre église (« Ouvrir la bibliothèque ») et révoquer ce partage.",
    href: paths.audio.parametres(),
    hrefLabel: "Paramètres audio",
    audience: { permissions: ["audio:manage"] },
    otherwise: "Les paramètres audio sont réglés par l'administration de l'église.",
    screens: [paths.audio.parametres()],
  },
];

/** Campagnes de collecte, évolutions de la spec 091 (KB-156 à KB-159). */
export const CAMPAGNES: readonly KnowledgeEntry[] = [
  {
    key: "KB-156",
    kind: "howto",
    title: "Collectes : préparer un message à copier",
    questions: ["message de relance de la collecte", "annonce de lancement de la campagne", "message whatsapp pour la collecte", "préparer un message de clôture", "point d'avancement de la campagne"],
    answer:
      "Dans la campagne, « Préparer un message » compose un texte à copier (format WhatsApp) : choisissez le type, puis « Court » ou « Complet ». Annonce de lancement, point d'avancement, relance collective et clôture avec remerciements s'adressent à tout le groupe ; demandes et relances individuelles donnent un message par personne, avec son lien. Rien n'est envoyé par Koinonia : copiez et envoyez vous-même.",
    href: paths.collectes(),
    hrefLabel: "Questionnaires",
    audience: CAMPAIGN_AUDIENCE,
    otherwise: CAMPAIGN_OTHERWISE,
    screens: [paths.collectes()],
    module: "campaigns",
  },
  {
    key: "KB-157",
    kind: "howto",
    title: "Collectes : rouvrir une contribution ou annuler une validation",
    questions: ["rouvrir un questionnaire soumis", "annuler la validation d'un questionnaire", "corriger un questionnaire validé", "demander une correction", "le répondant veut modifier ses réponses"],
    answer:
      "Dans la campagne, sur la ligne du questionnaire : « Demander une correction » renvoie un questionnaire soumis avec un motif ; « Rouvrir » le remet en saisie (réponses et fichiers conservés, répondant prévenu). Pour un questionnaire déjà validé, « Annuler la validation » le ramène d'abord à « Soumis », puis vous pouvez le rouvrir.",
    href: paths.collectes(),
    hrefLabel: "Questionnaires",
    audience: CAMPAIGN_AUDIENCE,
    otherwise: CAMPAIGN_OTHERWISE,
    screens: [paths.collectes()],
    module: "campaigns",
  },
  {
    key: "KB-158",
    kind: "howto",
    title: "Collectes : remplacer un répondant ou changer une échéance",
    questions: ["remplacer un répondant", "changer la personne qui répond à la collecte", "ajouter un répondant sans compte", "régénérer le lien d'un répondant", "repousser l'échéance d'un questionnaire"],
    answer:
      "Dans l'onglet « Répondants » de la campagne : « Remplacer » transmet la contribution à un remplaçant (l'ancien perd tout accès, lien compris) ; « Retirer » enlève un répondant, sauf le dernier d'un destinataire quand la campagne est ouverte ; « Ajouter une personne sans compte » crée un lien personnel (« Voir le lien », « Générer le lien » pour révoquer l'ancien). L'échéance se modifie par contribution.",
    href: paths.collectes(),
    hrefLabel: "Questionnaires",
    audience: CAMPAIGN_AUDIENCE,
    otherwise: CAMPAIGN_OTHERWISE,
    screens: [paths.collectes()],
    module: "campaigns",
  },
  {
    key: "KB-159",
    kind: "howto",
    title: "Collectes : créer, dupliquer et prévisualiser une campagne",
    questions: ["créer une campagne sans JSON", "éditeur graphique de campagne", "dupliquer une campagne", "voir le questionnaire comme le répondant", "exporter la définition d'une campagne"],
    answer:
      "« Nouvelle campagne » ouvre un éditeur graphique : il produit la même définition que l'import et passe par le même aperçu des changements. L'onglet « Export » exporte la définition (sans réponse, fichier ni répondant) et « Dupliquer » crée une copie de la structure en brouillon. « Voir l'aperçu » montre un questionnaire comme le répondant le verra, sans rien enregistrer.",
    href: paths.collectes(),
    hrefLabel: "Questionnaires",
    audience: CAMPAIGN_AUDIENCE,
    otherwise: CAMPAIGN_OTHERWISE,
    screens: [paths.collectes()],
    module: "campaigns",
  },
];

/** Finances, spec 086 et 089 (KB-182 à KB-186). */
export const FINANCES_EVOLUTIONS: readonly KnowledgeEntry[] = [
  {
    key: "KB-182",
    kind: "howto",
    title: "Archiver une demande comptable",
    questions: ["archiver une demande", "désarchiver une demande", "demande archivée", "ranger les demandes terminées", "où sont les demandes archivées"],
    answer:
      "Une demande entièrement réglée sort d'elle-même de la file. Sur la demande, « Archiver » la range à la main et « Désarchiver » la ramène ; le filtre de statut « Archivées » les retrouve. Toute action qui attend de nouveau la comptabilité la ressort automatiquement.",
    href: paths.accounting.requests(),
    hrefLabel: "Demandes comptables",
    audience: { permissions: ["accounting:manage"] },
    otherwise: "L'archivage des demandes est tenu par le Comptable.",
    screens: [paths.accounting.requests()],
  },
  {
    key: "KB-183",
    kind: "howto",
    title: "Voir une pièce jointe sans la télécharger",
    questions: ["voir un justificatif", "ouvrir une facture dans la demande", "visualiser la pièce jointe", "aperçu d'une pièce"],
    answer:
      "Sur une demande comptable, chaque pièce a un bouton « Voir » (œil) qui l'ouvre dans le navigateur — PDF et images — et un bouton « Télécharger ».",
    href: paths.accounting.requests(),
    hrefLabel: "Demandes comptables",
    audience: { permissions: ["accounting:view", "accounting:submit"] },
    otherwise: "Les pièces d'une demande se consultent depuis la demande, par les personnes qui y ont droit.",
    screens: [paths.accounting.requests()],
  },
  {
    key: "KB-184",
    kind: "howto",
    title: "Corriger « Payé depuis » après un paiement",
    questions: ["corriger le compte d'un paiement", "payé depuis la mauvaise caisse", "changer la caisse d'un paiement", "modifier d'où vient l'argent"],
    answer:
      "Sur la demande, « Payé depuis » d'un paiement déjà remis se corrige : choisissez le bon compte (compte commun ou caisse). Le mois doit être ouvert dans la trésorerie, pour l'ancien comme pour le nouveau compte ; la trésorerie reprend la correction.",
    href: paths.accounting.requests(),
    hrefLabel: "Demandes comptables",
    audience: { permissions: ["accounting:manage"] },
    otherwise: "Le compte d'un paiement est corrigé par le Comptable.",
    screens: [paths.accounting.requests()],
  },
  {
    key: "KB-185",
    kind: "howto",
    title: "Navette : demander le justificatif d'une ligne",
    questions: ["demander le justificatif navette", "ligne de la navette sans facture", "relancer l'équipe navette", "signaler une ligne de la navette", "caution non restituée"],
    answer:
      "Dans « Finances » › « Navette », ouvrez la ligne et cliquez sur « Demander le justificatif » : son auteur est prévenu et peut redéposer sa pièce, même après 48 heures. « Signaler la ligne » alerte l'équipe d'une anomalie ; « Marquer non restituée » suit une caution.",
    href: paths.accounting.navette(),
    hrefLabel: "Navette",
    audience: { permissions: ["shuttle:manage"] },
    otherwise: "Le justificatif d'une ligne de navette est demandé par le Comptable et l'administration.",
    screens: [paths.accounting.navette()],
  },
  {
    key: "KB-186",
    kind: "howto",
    title: "Navette : envoyer le justificatif demandé",
    questions: ["la compta me demande un justificatif navette", "envoyer le justificatif de ma ligne", "ajouter ma facture à la navette", "corriger ma dépense de navette"],
    answer:
      "Dans « Finances » › « Navette », ouvrez votre ligne puis « Envoyer le justificatif » (photo ou document). Vous seul pouvez le déposer ; la comptabilité est prévenue. Sans demande, une ligne se corrige ou se supprime pendant 48 heures.",
    href: paths.accounting.navette(),
    hrefLabel: "Navette",
    audience: { predicates: ["shuttleTeam"], permissions: ["shuttle:manage"] },
    otherwise: "Seul l'auteur d'une ligne de navette peut y redéposer le justificatif demandé.",
    screens: [paths.accounting.navette()],
  },
];

/** Site d'événement, spec 087 (KB-187). */
export const SITE_IMAGES: readonly KnowledgeEntry[] = [
  {
    key: "KB-187",
    kind: "howto",
    title: "Déposer des images pour le site d'un événement",
    questions: ["ajouter des images au site de l'événement", "téléverser des photos pour le site", "mon assistant IA veut une image", "lien pour déposer des images", "texte alternatif des images"],
    answer:
      "Dans « Événements » › « Billetterie », ouvrez l'événement puis la page « Images » (rôle Site ou Organisateur) : « Choisir des images » (JPEG, PNG, WebP ou SVG, 8 Mo chacune), un « Texte alternatif » obligatoire pour chacune, puis « Envoyer les images ». Un assistant IA connecté vous donne l'adresse de cette page quand il a besoin d'un fichier.",
    href: paths.billetterie(),
    hrefLabel: "Billetterie",
    audience: { predicates: ["ticketingSites"] },
    otherwise: "Les images du site sont déposées par l'organisateur de l'événement ou la personne chargée du site.",
    screens: [paths.billetterie()],
  },
];

/** Formulaires, résultats et accès délégué (KB-188 à KB-190). */
export const FORMULAIRES: readonly KnowledgeEntry[] = [
  {
    key: "KB-188",
    kind: "howto",
    title: "Lire les résultats d'un formulaire",
    questions: ["résultats du sondage", "voir les réponses d'un formulaire", "statistiques d'un formulaire", "exporter les réponses", "qui a répondu au formulaire"],
    answer:
      "Dans « Formulaires », ouvrez le formulaire : l'onglet « Réponses » liste les réponses et les exporte ; l'onglet « Résultats » les regroupe par question (graphiques, réponses libres sans nom). « Inscrits » et « Présence » servent aux inscriptions à sessions.",
    href: paths.formulaires(),
    hrefLabel: "Formulaires",
    audience: { predicates: ["forms"] },
    otherwise: "Les résultats d'un formulaire sont lus par ses gestionnaires.",
    screens: [paths.formulaires()],
  },
  {
    key: "KB-189",
    kind: "howto",
    title: "Compter les participants d'un événement avec un formulaire",
    questions: ["combien de participants viennent", "formulaire de participation", "nombre d'accompagnants", "rattacher un formulaire à un événement", "total des participants"],
    answer:
      "Créez un formulaire de type participation et rattachez-le à un événement : « Je viens » et « Nombre d'accompagnants » donnent le total des participants, visible dans l'onglet « Résultats » et sur l'événement.",
    href: paths.formulaires(),
    hrefLabel: "Formulaires",
    audience: { predicates: ["forms"] },
    otherwise: "Les formulaires de participation sont créés par les gestionnaires de formulaires.",
    screens: [paths.formulaires()],
  },
  {
    key: "KB-190",
    kind: "howto",
    title: "Donner l'accès « Formulaires » à un compte",
    questions: ["donner accès aux formulaires", "partager un formulaire", "co-gestionnaire d'un formulaire", "accès délégué aux formulaires", "retirer l'accès aux formulaires"],
    answer:
      "Dans « Formulaires », « Gérer les accès » donne à un compte la gestion de ses propres formulaires. Il peut partager un formulaire avec un autre compte autorisé dans l'onglet « Réglages › Partage » : le co-gestionnaire peut tout faire sauf supprimer et gérer le partage. Retirer l'accès suspend aussi ses partages.",
    href: paths.formulaires(),
    hrefLabel: "Formulaires",
    audience: { permissions: ["forms:manage"] },
    otherwise: "Les accès « Formulaires » sont donnés par le Secrétaire et l'administration de l'église.",
    screens: [paths.formulaires()],
  },
];

/** Intégration, discipolat, emploi, salles (KB-191 à KB-199). */
export const AUTRES: readonly KnowledgeEntry[] = [
  {
    key: "KB-191",
    kind: "howto",
    title: "Suivre le parcours d'intégration",
    questions: ["parcours d'intégration", "jalons d'une famille", "marquer un jalon atteint", "familles sans PCNC", "qui n'a pas encore de discipolat"],
    answer:
      "Dans l'espace « Personnes », « Intégration » › « Parcours » suit quatre jalons par personne : Famille, PCNC, Service et Discipolat. Filtrez avec « Sans … » pour voir qui n'a pas atteint un jalon, puis « Marquer atteint » (ou « Retirer le jalon »).",
    href: paths.integration.parcours(),
    hrefLabel: "Parcours",
    audience: INTEGRATION_AUDIENCE,
    otherwise: INTEGRATION_OTHERWISE,
    screens: [paths.integration.parcours()],
  },
  {
    key: "KB-192",
    kind: "howto",
    title: "Bergers, statistiques et délais de relance de l'intégration",
    questions: ["affecter un berger", "co-berger", "statistiques d'intégration", "délai de relance de l'intégration", "paramètres de l'intégration"],
    answer:
      "Dans l'espace « Personnes », « Intégration » : « Bergers » gère les bergers et co-bergers (chacun ne voit que ses familles) ; « Statistiques » donne les volumes ; « Paramètres » règle les délais de relance, réservés aux responsables de l'intégration et à l'administration.",
    href: paths.integration.leaders(),
    hrefLabel: "Bergers",
    audience: INTEGRATION_AUDIENCE,
    otherwise: INTEGRATION_OTHERWISE,
    screens: [paths.integration.leaders(), paths.integration.stats(), paths.integration.parametres()],
  },
  {
    key: "KB-193",
    kind: "howto",
    title: "Statistiques et export du discipolat",
    questions: ["statistiques du discipolat", "exporter le discipolat", "export excel des disciples", "relations de discipolat", "changer le faiseur de disciples"],
    answer:
      "Dans l'espace « Personnes », « Discipolat » a trois onglets : « Relations » (créer, modifier ou supprimer une relation, changer le faiseur de disciples), « Appel » et « Statistiques ». « Exporter en Excel » est réservé au Secrétaire et à l'administration.",
    href: paths.admin.discipleship(),
    hrefLabel: "Discipolat",
    audience: { permissions: ["discipleship:view"] },
    otherwise: "Le discipolat est suivi par les faiseurs de disciples, les responsables, les Ministres et l'administration.",
    screens: [paths.admin.discipleship()],
  },
  {
    key: "KB-194",
    kind: "howto",
    title: "Publier une offre ou une annonce d'emploi",
    questions: ["publier une offre d'emploi", "je cherche un stage", "proposer une mission freelance", "créer mon profil freelance", "publier une recherche d'emploi"],
    answer:
      "Dans l'espace « Ressources », « Offres » › « Publier » propose quatre sortes d'annonce : emploi, stage ou alternance ; « Je cherche… » ; mission freelance ; profil freelance. Remplissez le formulaire puis publiez ; un récapitulatif WhatsApp est prêt à copier.",
    href: paths.jobs(),
    hrefLabel: "Offres",
    audience: { permissions: ["jobs:post"] },
    otherwise: "La publication d'offres est ouverte aux comptes de l'église ayant accès aux offres.",
    screens: [paths.jobs()],
  },
  {
    key: "KB-195",
    kind: "howto",
    title: "Gérer mes publications d'offres",
    questions: ["retirer mon offre", "mes publications", "mission pourvue", "me déclarer disponible", "republier mon annonce"],
    answer:
      "Dans « Ressources » › « Offres » › « Mes publications » : retirez une annonce (vous pourrez la republier) ou supprimez-la. Sur une mission, « Marquer la mission pourvue » ; sur un profil freelance, « Me déclarer disponible » ou « indisponible ».",
    href: paths.jobs(),
    hrefLabel: "Offres",
    audience: { permissions: ["jobs:post"] },
    otherwise: "Seul l'auteur d'une annonce la retire ou la modifie.",
    screens: [paths.jobs()],
  },
  {
    key: "KB-196",
    kind: "howto",
    title: "Déclarer l'ouverture et la fermeture d'une salle",
    questions: ["déclarer l'ouverture de la salle", "déclarer la fermeture de la salle", "main courante de la salle", "j'ai fini ma réservation", "checklist de la salle"],
    answer:
      "Sur votre réservation, « Déclarer l'ouverture » à l'arrivée puis « Déclarer la fermeture » en partant, en cochant la checklist de la salle. Cette déclaration permet ensuite le contrôle de la salle.",
    href: paths.rooms(),
    hrefLabel: "Salles",
    audience: { permissions: ["rooms:reserve"] },
    otherwise: "Seules les personnes pouvant réserver une salle déclarent son ouverture et sa fermeture.",
    screens: [paths.rooms()],
  },
  {
    key: "KB-197",
    kind: "howto",
    title: "Contrôler les mains courantes des salles",
    questions: ["contrôler une salle", "signaler un écart de salle", "valider la fermeture d'une salle", "contrôle des mains courantes", "salle non ouverte"],
    answer:
      "Dans « Ressources » › « Salles », l'écran « Contrôle des mains courantes » liste chaque réservation avec son état (Non ouverte, Ouverte, Fermeture déclarée, Validée, Écart signalé). « Contrôler » valide la fermeture, « Signaler un écart » le note, « Clôturer sans déclaration » ferme un oubli.",
    href: paths.rooms.checklists(),
    hrefLabel: "Contrôle des mains courantes",
    audience: { permissions: ["rooms:manage"] },
    otherwise: "Le contrôle des salles revient à l'administration de l'église et à l'équipe désignée pour le contrôle.",
    screens: [paths.rooms.checklists()],
  },
];

export const EVOLUTIONS: readonly KnowledgeEntry[] = [
  ...PASTORAL,
  ...AUDIO,
  ...CAMPAGNES,
  ...FINANCES_EVOLUTIONS,
  ...SITE_IMAGES,
  ...FORMULAIRES,
  ...AUTRES,
];
