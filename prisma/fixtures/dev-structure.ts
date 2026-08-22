/**
 * Structure fictive (églises, ministères, départements) du jeu de données de développement.
 *
 * Les libellés s'inspirent de la structure réelle observée sur un export de production
 * (voir specs/015-environnement-dev-contributeurs/plan.md, section "Inspiration réelle") —
 * aucun nom d'église, de personne ou identifiant réel n'est repris tel quel.
 */

export interface DevChurchDef {
  key: string;
  name: string;
  slug: string;
  primaryColor: string;
}

export interface DevMinistryDef {
  key: string;
  churchKey: string;
  name: string;
}

export interface DevDepartmentDef {
  key: string;
  ministryKey: string;
  name: string;
  /** Fonction système du département — voir src/lib/department-functions.ts */
  function?: string;
}

// Église principale, enrichie — sert de terrain de jeu par défaut.
// Deux églises secondaires, plus petites — permettent de tester l'isolation multi-tenant.
// Trois villes bretonnes (une par département historique représenté) —
// aucune ne correspond à une implantation ICC réelle connue.
export const DEV_CHURCHES: DevChurchDef[] = [
  { key: "kervignac", name: "ICC Kervignac", slug: "icc-kervignac", primaryColor: "#5E17EB" },
  { key: "guingamp", name: "ICC Guingamp", slug: "icc-guingamp", primaryColor: "#38B6FF" },
  { key: "landerneau", name: "ICC Landerneau", slug: "icc-landerneau", primaryColor: "#FF3131" },
];

export const DEV_MINISTRIES: DevMinistryDef[] = [
  // ICC Kervignac
  { key: "ordre", churchKey: "kervignac", name: "Ordre" },
  { key: "croissance", churchKey: "kervignac", name: "Croissance spirituelle" },
  { key: "coordination", churchKey: "kervignac", name: "Coordination générale" },
  { key: "jeunesse", churchKey: "kervignac", name: "Jeunesse" },
  { key: "communication", churchKey: "kervignac", name: "Communication" },
  // ICC Guingamp
  { key: "louange-guingamp", churchKey: "guingamp", name: "Louange" },
  { key: "coordination-guingamp", churchKey: "guingamp", name: "Coordination générale" },
  // ICC Landerneau
  { key: "louange-landerneau", churchKey: "landerneau", name: "Louange" },
  { key: "jeunesse-landerneau", churchKey: "landerneau", name: "Jeunesse" },
];

export const DEV_DEPARTMENTS: DevDepartmentDef[] = [
  // ICC Kervignac — Ordre
  { key: "accueil", ministryKey: "ordre", name: "Accueil" },
  { key: "securite", ministryKey: "ordre", name: "Sécurité", function: "SECURITE" },
  { key: "entretien", ministryKey: "ordre", name: "Entretien", function: "ENTRETIEN" },
  // ICC Kervignac — Croissance spirituelle
  { key: "evangelisation", ministryKey: "croissance", name: "Évangélisation" },
  { key: "formation", ministryKey: "croissance", name: "Formation" },
  { key: "sainte-cene", ministryKey: "croissance", name: "Sainte cène" },
  // ICC Kervignac — Coordination générale
  { key: "secretariat", ministryKey: "coordination", name: "Secrétariat", function: "SECRETARIAT" },
  { key: "logistique", ministryKey: "coordination", name: "Logistique" },
  { key: "gestion-site", ministryKey: "coordination", name: "Gestion de site" },
  // ICC Kervignac — Jeunesse
  { key: "impact-junior", ministryKey: "jeunesse", name: "Impact Junior" },
  { key: "pole-ado", ministryKey: "jeunesse", name: "Pôle ado" },
  // ICC Kervignac — Communication
  { key: "reseaux-sociaux", ministryKey: "communication", name: "Réseaux sociaux", function: "COMMUNICATION" },
  { key: "production-media", ministryKey: "communication", name: "Production média", function: "PRODUCTION_MEDIA" },
  { key: "regie-technique", ministryKey: "communication", name: "Régie technique" },

  // ICC Guingamp
  { key: "choristes-guingamp", ministryKey: "louange-guingamp", name: "Choristes" },
  { key: "musiciens-guingamp", ministryKey: "louange-guingamp", name: "Musiciens" },
  { key: "secretariat-guingamp", ministryKey: "coordination-guingamp", name: "Secrétariat", function: "SECRETARIAT" },
  { key: "accueil-guingamp", ministryKey: "coordination-guingamp", name: "Accueil" },

  // ICC Landerneau
  { key: "choristes-landerneau", ministryKey: "louange-landerneau", name: "Choristes" },
  { key: "son-landerneau", ministryKey: "louange-landerneau", name: "Son" },
  { key: "ados-landerneau", ministryKey: "jeunesse-landerneau", name: "Ados" },
  { key: "enfants-landerneau", ministryKey: "jeunesse-landerneau", name: "Enfants" },
];
