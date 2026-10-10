import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const AGE_RANGES = ["18-20 ans", "21-30 ans", "31-40 ans", "41-50 ans", "+50 ans"] as const;

export const DURATIONS = ["Moins de 1 an", "1 à 2 ans", "2 à 3 ans", "3 à 5 ans", "+ 5 ans"] as const;

export const MOTIFS = ["Renseignements", "Démarches administratives", "Vie familiale", "Croissance spirituelle", "Oppressions", "Maladie", "Service", "Études"] as const;

export const submitSchema = z.object({
  churchSlug: z.string().min(1),
  lastName: z.string().min(1, "Le nom est requis"),
  firstName: z.string().min(1, "Le prénom est requis"),
  gender: z.enum(["Homme", "Femme"], { errorMap: () => ({ message: "Veuillez sélectionner votre sexe" }) }),
  phone: z.string().min(1, "Le téléphone est requis"),
  email: z.string().email("Email invalide"),
  ageRange: z.enum(AGE_RANGES, { errorMap: () => ({ message: "Veuillez sélectionner votre tranche d'âge" }) }),
  membershipDuration: z.enum(DURATIONS, { errorMap: () => ({ message: "Veuillez sélectionner votre ancienneté à l'église" }) }),
  isStar: z.enum(["Oui", "Non"], { errorMap: () => ({ message: "Veuillez répondre à cette question" }) }),
  department: z.string().nullable().optional(),
  motifs: z.array(z.enum(MOTIFS)).min(1, "Veuillez sélectionner au moins un motif"),
  details: z.string().trim().max(2000, "2000 caractères maximum").optional(),
  turnstileToken: z.string().min(1, "Vérification anti-robots manquante"),
});

export const contract = defineContract({
  POST: {
    summary: "Demande de rendez-vous pastoral par le formulaire public",
    description: "Protégée par Turnstile (400 si la vérification échoue) et limitée à 3 envois par minute et par IP. Église désignée par son adresse publique (404 si inconnue).",
    access: "public",
    body: submitSchema,
    status: 201,
    response: "`{ id }`",
  },
});
