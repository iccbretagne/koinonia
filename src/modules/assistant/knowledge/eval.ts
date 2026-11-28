/**
 * Jeu d'évaluation du moteur (spec 075) : une question telle qu'un utilisateur la tape → la
 * fiche attendue en tête. Une partie des formulations ne partage aucun mot avec la fiche, pour
 * mesurer la compréhension par le sens. Utilisé par les tests (sous-ensemble lexical) et par
 * `npm run assistant:eval` avec le vrai modèle (cible ≥ 85 % en tête).
 */
export interface EvalCase {
  question: string;
  expected: string;
  /** Formulation sans mot commun avec la fiche : seule la recherche par le sens la reconnaît. */
  semanticOnly?: boolean;
  /**
   * Rôle de la personne qui pose la question (absent : Super Admin avec tous les prédicats).
   * Une fiche hors de son audience attendue donne son **refus** (même clé), jamais une donnée.
   */
  role?: string;
  /** Prédicats du compte, pour un cas avec `role`. */
  predicates?: readonly string[];
}

export const EVAL_CASES: readonly EvalCase[] = [
  { question: "je suis pas dispo dimanche je fais comment", expected: "KB-021" },
  { question: "ajouter des créneaux d'entretien pour les candidats", expected: "KB-151" },
  { question: "quels entretiens je reçois", expected: "D24" },
  { question: "candidats sans entretien", expected: "D25" },
  { question: "reste-t-il des créneaux d'entretien libres", expected: "D26" },
  { question: "combien d'inscrits à mes événements de billetterie", expected: "D27" },
  { question: "quels paiements de billetterie sont à confirmer", expected: "D28" },
  { question: "mes campagnes de collecte", expected: "D29" },
  { question: "où en est la campagne de collecte", expected: "D30" },
  { question: "comment remplir mon questionnaire de collecte", expected: "KB-154" },
  { question: "importer une campagne de collecte", expected: "KB-155" },
  { question: "piloter le site de l'événement avec mon assistant IA", expected: "KB-SITE-IA" },
  { question: "dupliquer un événement de billetterie", expected: "KB-EVT-DUP" },
  { question: "comment déclarer une absense", expected: "KB-021" },
  { question: "je serai pas là dimanche", expected: "KB-021", semanticOnly: true },
  { question: "dimanche je pourrai pas venir", expected: "KB-021" },
  { question: "je pars en vacances 2 semaines", expected: "KB-022" },
  { question: "comment je remplis mes dispos du mois", expected: "KB-023" },
  { question: "je suis malade je peux plus servir dimanche", expected: "KB-024" },
  { question: "je rentre plus tot de vacances", expected: "KB-025" },
  { question: "quand est la prochaine répèt", expected: "D07" },
  { question: "je sers quand", expected: "D01" },
  { question: "mon planning du mois", expected: "D02" },
  { question: "mettre koinonia sur mon iphone", expected: "KB-005" },
  { question: "je recois pas les notifs", expected: "KB-006" },
  { question: "trop de mails", expected: "KB-007" },
  { question: "passer en mode sombre", expected: "KB-004" },
  { question: "lier mon compte a ma fiche", expected: "KB-003" },
  { question: "faire le planning de dimanche pour mon equipe", expected: "KB-040" },
  { question: "trouver quelqu'un pour remplacer un star", expected: "KB-042" },
  { question: "ajouter un nouveau membre", expected: "KB-060" },
  { question: "donner les droits admin a quelqu'un", expected: "KB-062" },
  { question: "créer un culte", expected: "KB-070" },
  { question: "saisir le compte rendu du culte", expected: "KB-071" },
  { question: "demander une affiche pour la soirée", expected: "KB-080" },
  { question: "ou en est ma demande", expected: "KB-081" },
  { question: "me faire rembourser un achat", expected: "KB-100" },
  { question: "saisir la quete de dimanche", expected: "KB-102" },
  { question: "deposer les cheques a la banque", expected: "KB-103" },
  { question: "cloturer octobre", expected: "KB-104" },
  { question: "plein d'essence du minibus", expected: "KB-105" },
  { question: "reserver une salle jeudi soir", expected: "KB-140" },
  { question: "reecouter la predication", expected: "KB-141" },
  { question: "je cherche un boulot", expected: "KB-142" },
  { question: "scanner les billets a l'entree", expected: "KB-143" },
  { question: "quel temps fera t il dimanche", expected: "KB-900" },
  { question: "donne moi le numero de mon responsable", expected: "KB-901" },
  { question: "qui est indisponible dimanche", expected: "D12" },
  { question: "solde de la caisse", expected: "D21" },
  { question: "parler à quelqu'un, ça ne va pas en ce moment", expected: "KB-085", semanticOnly: true },
  { question: "mon téléphone ne m'alerte jamais", expected: "KB-006", semanticOnly: true },
  { question: "l'argent qui reste pour le car", expected: "D20", semanticOnly: true },
  // Rôles de terrain (spec 075, enrichissement de la base)
  { question: "valider une note de frais", expected: "KB-101", role: "ACCOUNTANT" },
  { question: "vérifier les factures d'une avance", expected: "KB-109", role: "ACCOUNTANT" },
  { question: "archiver une demande terminée", expected: "KB-182", role: "ACCOUNTANT" },
  { question: "corriger la caisse d'un paiement", expected: "KB-184", role: "ACCOUNTANT" },
  { question: "saisir le compte rendu du culte", expected: "KB-071", role: "REPORTER" },
  { question: "derniers comptes rendus", expected: "D32", role: "REPORTER" },
  { question: "contenu du dernier compte rendu", expected: "D33", role: "REPORTER" },
  { question: "faire l'appel de mes disciples", expected: "KB-120", role: "DISCIPLE_MAKER" },
  { question: "statistiques du discipolat", expected: "KB-193", role: "DISCIPLE_MAKER" },
  { question: "confier une demande de rendez-vous pastoral", expected: "KB-130", role: "PASTORAL_CARE_REFERENT" },
  { question: "suivi des nouveaux convertis", expected: "KB-131", role: "PASTORAL_CARE_REFERENT" },
  { question: "créer un département", expected: "KB-161", role: "MINISTER" },
  { question: "ajouter un ministère", expected: "KB-160", role: "MINISTER" },
  { question: "retirer un rôle de responsable", expected: "KB-164", role: "MINISTER" },
  { question: "retrouver un membre de l'église", expected: "KB-178", role: "STAR", predicates: ["pastoral"] },
  { question: "le pasteur peut-il modifier un compte rendu", expected: "KB-179", role: "STAR", predicates: ["pastoral"] },
  { question: "créer une église", expected: "KB-170" },
  { question: "faire une sauvegarde", expected: "KB-171" },
  { question: "changer l'icône de l'application", expected: "KB-172" },
  { question: "approuver un domaine dédié", expected: "KB-175" },
  { question: "ajouter une fiche à l'assistant", expected: "KB-174" },
  { question: "définir le département de la navette", expected: "KB-162" },
  // Refus : la fiche est trouvée, mais la réponse est le refus, sans donnée
  { question: "créer une église", expected: "KB-170", role: "STAR" },
  { question: "faire une sauvegarde", expected: "KB-171", role: "ADMIN" },
  { question: "changer l'icône de l'application", expected: "KB-172", role: "DEPARTMENT_HEAD" },
  { question: "valider une note de frais", expected: "KB-101", role: "STAR" },
  { question: "solde de la caisse", expected: "D21", role: "SECRETARY" },
  { question: "publier un culte", expected: "KB-180", role: "STAR" },
  { question: "inscris-moi à l'événement", expected: "KB-902" },
  { question: "fais-le pour moi", expected: "KB-902", role: "STAR" },
  // Specs 084 à 091
  { question: "préparer un message de relance pour la collecte", expected: "KB-156" },
  { question: "annuler la validation d'un questionnaire", expected: "KB-157" },
  { question: "remplacer un répondant", expected: "KB-158" },
  { question: "créer une campagne sans JSON", expected: "KB-159" },
  { question: "ajouter des images au site de l'événement", expected: "KB-187" },
  { question: "demander le justificatif d'une ligne de navette", expected: "KB-185" },
  { question: "donner accès aux formulaires à un compte", expected: "KB-190" },
  { question: "résultats du sondage", expected: "KB-188" },
  { question: "voir la pièce jointe sans la télécharger", expected: "KB-183" },
  { question: "dépublier un culte", expected: "KB-180" },
  { question: "parcours d'intégration jalons", expected: "KB-191" },
  { question: "déclarer l'ouverture de la salle", expected: "KB-196" },
  { question: "publier une annonce de stage", expected: "KB-194" },
  { question: "personnaliser le visuel du billet avec mon assistant IA", expected: "KB-BILLET-VISUEL-IA" },
];
