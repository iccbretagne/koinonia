import { z } from "zod";
import { contactConsentSchema } from "@/modules/integration/schemas";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  // Identité
  firstName:    z.string().min(1).max(100),
  lastName:     z.string().min(1).max(100),
  email:        z.string().email().optional().or(z.literal("")),
  phone:        z.string().min(1, "Le téléphone est obligatoire").max(30),
  // Adresse
  address:      z.string().max(500).optional().or(z.literal("")),
  // Profil
  ageRange:     z.enum(["YOUTH", "YOUNG_ADULT", "ADULT", "SENIOR"]),
  churchStatus: z.enum(["VISITOR", "REGULAR", "ENGAGED"]).default("VISITOR"),
  // Options
  pastoralCareRequested: z.boolean().default(false),
  pastoralMessage:       z.string().max(2000).optional().or(z.literal("")),
  // Appel au salut
  salvationCall: z.boolean().default(false),
  // Consentement au contact : maintenant ou plus tard (spec 051)
  contactConsent: contactConsentSchema,
  // Lien membre optionnel (si connecté)
  memberId:    z.string().optional(),
  churchId:    z.string().min(1),
  turnstileToken: z.string().min(1, "Vérification anti-robots manquante"),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des demandes d'intégration",
    description: "Demandes non archivées, de la plus récente à la plus ancienne, avec berger affecté et fiche membre liée.",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP (accès complet) ; un berger/co-berger ne voit que les demandes de ses familles",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      status: z.string().optional().describe("Filtre sur le statut de la demande"),
      familyId: z.string().optional().describe("Filtre sur la famille affectée"),
      search: z.string().optional().describe("Recherche sur nom, prénom, email, téléphone"),
    }),
    response: "Liste des demandes",
  },
  POST: {
    summary: "Dépôt d'une demande d'intégration",
    description:
      "Formulaire public « rejoindre », limité à 5 appels par minute et par IP et protégé par Turnstile (400 si la vérification échoue). " +
      "Géocode l'adresse pour suggérer une famille, crée un dossier de parcours (sans bloquer en cas de doublon) et émet l'événement `request.submitted` dans la même transaction " +
      "(le module `care` y crée un rendez-vous pastoral ou un suivi de nouveau converti, spec 052). Prévient l'équipe Intégration et envoie un email de confirmation au demandeur s'il a donné une adresse.",
    access: "public",
    body: createSchema,
    status: 201,
    response: "`{ id, suggestedFamilyName }`",
  },
});
