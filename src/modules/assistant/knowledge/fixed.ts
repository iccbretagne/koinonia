import { ALL, type KnowledgeEntry } from "./types";

/** 11. Hors sujet et limites : réponses fixes (KB-900 à KB-902). */
export const FIXED: readonly KnowledgeEntry[] = [
  {
    key: "KB-900",
    kind: "fixed",
    title: "Question hors sujet",
    questions: [
      "Quel temps fera-t-il ?",
      "météo",
      "verset du jour",
      "conseil personnel",
      "prière",
      "question biblique",
      "raconte une blague",
      "résultat du match",
    ],
    answer:
      "Je vous aide uniquement à utiliser Koinonia. Pour un accompagnement, vous pouvez demander un rendez-vous pastoral depuis « Mes demandes ».",
    audience: ALL,
  },
  {
    key: "KB-901",
    kind: "fixed",
    title: "Coordonnées d'une autre personne",
    questions: [
      "Numéro de téléphone de mon responsable",
      "email de mon responsable",
      "adresse d'un membre",
      "donne moi le numéro de",
      "contact du pasteur",
    ],
    answer:
      "Je ne donne pas les coordonnées d'une autre personne. Elles sont visibles, selon votre rôle, dans la fiche de la personne ou sur le service concerné.",
    audience: ALL,
  },
  {
    key: "KB-902",
    kind: "fixed",
    title: "Agir à ma place",
    questions: ["Inscris-moi", "déclare mon absence pour moi", "valide la demande", "fais-le pour moi", "mets moi en service"],
    answer: "Je ne fais pas d'action à votre place : je vous explique et je vous ouvre le bon écran.",
    audience: ALL,
  },
];
