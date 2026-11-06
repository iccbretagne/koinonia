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
}

export const EVAL_CASES: readonly EvalCase[] = [
  { question: "je suis pas dispo dimanche je fais comment", expected: "KB-021" },
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
];
