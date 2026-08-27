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
  SECURITE: "SECURITE",
  ENTRETIEN: "ENTRETIEN",
} as const;

