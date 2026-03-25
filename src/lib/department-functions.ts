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
} as const;

export type SystemFunction = (typeof DEPT_FN)[keyof typeof DEPT_FN];

export const SYSTEM_FUNCTIONS: {
  key: SystemFunction;
  label: string;
  description: string;
}[] = [
  {
    key: DEPT_FN.SECRETARIAT,
    label: "Secrétariat",
    description: "Traite les demandes et la diffusion interne",
  },
  {
    key: DEPT_FN.COMMUNICATION,
    label: "Communication",
    description: "Publie les annonces sur les réseaux sociaux",
  },
  {
    key: DEPT_FN.PRODUCTION_MEDIA,
    label: "Production Média",
    description: "Crée les visuels pour les demandes",
  },
];

/** Vérifie si une fonction est une fonction système (non supprimable). */
export function isSystemFunction(fn: string): fn is SystemFunction {
  return Object.values(DEPT_FN).includes(fn as SystemFunction);
}
