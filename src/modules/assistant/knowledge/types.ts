/**
 * Format des fiches de la base de connaissances (spec 075).
 *
 * Les fiches fournies avec Koinonia vivent dans ce dossier, versionnées avec l'application ;
 * la base de données ne garde que les ajouts et corrections du Super Admin.
 */

/**
 * Prédicats d'accès résolus côté serveur par la couche `src/app` (jamais déduits du client) :
 * - `linkedStar` : compte lié à une fiche STAR dans l'église courante
 * - `shuttleTeam` : équipe navette (`getShuttleAccess`)
 * - `ticketing` : billetterie visible (`isTicketingVisible`)
 * - `secretariatTeam`, `mediaTeam`, `integrationTeam` : membre d'un département de fonction
 * - `pastoral` : profil pastoral dans l'église courante
 * - `announcementSheet` : lecture de la trame des annonces (`canReadAnnouncementSheet`)
 */
export const PREDICATES = [
  "linkedStar",
  "shuttleTeam",
  "ticketing",
  "secretariatTeam",
  "mediaTeam",
  "integrationTeam",
  "pastoral",
  "announcementSheet",
] as const;
export type Predicate = (typeof PREDICATES)[number];

/**
 * Qui reçoit la réponse : `all`, ou au moins un rôle, une permission ou un prédicat. Les rôles
 * s'entendent dans l'église courante ; le Super Admin y a le rôle `SUPER_ADMIN`.
 */
export interface Audience {
  all?: true;
  roles?: readonly string[];
  permissions?: readonly string[];
  predicates?: readonly Predicate[];
}

export type EntryKind = "howto" | "data" | "fixed";

export interface KnowledgeEntry {
  /** « KB-021 », « D02 », ou l'identifiant d'une fiche ajoutée. */
  key: string;
  kind: EntryKind;
  title: string;
  /** Formulation principale puis variantes (fautes et mots familiers compris). */
  questions: readonly string[];
  /** Réponse écrite ; les éléments d'interface entre « ». */
  answer: string;
  href?: string;
  hrefLabel?: string;
  audience: Audience;
  /** Réponse aux autres rôles : qui peut le faire, sans aucune donnée. */
  otherwise?: string;
  /**
   * Module propriétaire : la fiche disparaît s'il est désactivé. Déduit du lien par défaut
   * (table des routes) ; à préciser pour une fiche sans lien.
   */
  module?: string;
  /** Préfixes d'écran où la fiche figure dans les questions fréquentes. */
  screens?: readonly string[];
  /** Fiche `data` : clé du fournisseur de la question de données. */
  dataQuestion?: string;
  /** Origine : fournie avec Koinonia, corrigée ou ajoutée par le Super Admin. */
  origin?: "builtin" | "override" | "custom";
  /** Formulations rattachées par le Super Admin. */
  aliases?: readonly string[];
}

export const ALL: Audience = { all: true };
