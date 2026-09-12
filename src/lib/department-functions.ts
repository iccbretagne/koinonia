import type { RequestType } from "@/generated/prisma/client";

/**
 * Constantes pour les fonctions de département.
 *
 * Les fonctions "système" ont un comportement codé en dur (routage des annonces,
 * dashboards spécialisés). Les fonctions personnalisées sont de simples labels
 * assignés par l'admin d'église.
 */

export const DEPT_FN = {
  SECRETARIAT: "SECRETARIAT",
  COMMUNICATION: "COMMUNICATION",
  PRODUCTION_MEDIA: "PRODUCTION_MEDIA",
  PROTOCOLE: "PROTOCOLE",
  INTEGRATION: "INTEGRATION",
  MSDP: "MSDP",
  SECURITE: "SECURITE",
  ENTRETIEN: "ENTRETIEN",
  MODERATION: "MODERATION",
  CAPTATION_AUDIO: "CAPTATION_AUDIO",
} as const;

export type DeptFunction = (typeof DEPT_FN)[keyof typeof DEPT_FN];

/**
 * Libellés français des fonctions "système" — utilisés quand une fonction n'a aucun
 * département configuré (spec 046).
 */
export const DEPT_FN_LABEL: Record<DeptFunction, string> = {
  SECRETARIAT: "Secrétariat",
  COMMUNICATION: "Communication",
  PRODUCTION_MEDIA: "Production Média",
  PROTOCOLE: "Protocole",
  INTEGRATION: "Intégration",
  MSDP: "Soins Pastoraux (MSDP)",
  SECURITE: "Sécurité",
  ENTRETIEN: "Entretien",
  MODERATION: "Modération",
  CAPTATION_AUDIO: "Captation Audio",
};

/**
 * Fonction de département destinataire de chaque type de demande (spec 046) — routage
 * indépendant du nombre de départements qui la portent : une demande "suit la fonction",
 * pas un département assigné à sa création.
 */
export const REQUEST_TYPE_FUNCTION: Record<RequestType, DeptFunction> = {
  VISUEL: DEPT_FN.PRODUCTION_MEDIA,
  RESEAUX_SOCIAUX: DEPT_FN.COMMUNICATION,
  DIFFUSION_INTERNE: DEPT_FN.SECRETARIAT,
  AJOUT_EVENEMENT: DEPT_FN.SECRETARIAT,
  MODIFICATION_EVENEMENT: DEPT_FN.SECRETARIAT,
  ANNULATION_EVENEMENT: DEPT_FN.SECRETARIAT,
  MODIFICATION_PLANNING: DEPT_FN.SECRETARIAT,
  DEMANDE_ACCES: DEPT_FN.SECRETARIAT,
};

export function functionForRequestType(type: RequestType): DeptFunction {
  return REQUEST_TYPE_FUNCTION[type];
}

/**
 * Types de demande dont la fonction destinataire est `fn` — utilisé par les dashboards
 * (Secrétariat, Média, Communication) pour filtrer `Request.type` au lieu de l'ancien
 * `assignedDeptId` (spec 046).
 */
export function requestTypesForFunction(fn: DeptFunction): RequestType[] {
  return (Object.keys(REQUEST_TYPE_FUNCTION) as RequestType[]).filter(
    (type) => REQUEST_TYPE_FUNCTION[type] === fn
  );
}

/**
 * Texte du destinataire affiché au demandeur (spec 046) : le nom du département s'il n'y
 * en a qu'un (identique à l'affichage d'avant cette feature), les noms triés séparés par
 * une virgule s'il y en a plusieurs, ou la fonction marquée non configurée s'il n'y en a
 * aucun.
 */
export function formatAssignedDepts(fn: DeptFunction, depts: { name: string }[]): string {
  if (depts.length === 0) return `${DEPT_FN_LABEL[fn]} (non configuré)`;
  return depts
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b))
    .join(", ");
}
