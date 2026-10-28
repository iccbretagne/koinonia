import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Envoi d'une candidature au service par le formulaire public",
    description:
      "Spec 073. 411 sans Content-Length et 413 au-delà de 9 Mo, avant lecture du corps. 404 si l'église est inconnue ou n'a pas de département de fonction « Vie des STAR (PVS) ». Limitée à 5 envois par minute et par IP, protégée par Turnstile (400) et par un champ piège (faux succès). La photo est obligatoire : format décodé JPEG, PNG, WebP ou HEIC (jamais de SVG), 8 Mo au plus, réencodée en JPEG 600 × 800 sans métadonnées. Le consentement est requis. Notifie l'équipe PVS (lien seul) et met en copie l'adresse email du PVS. Aucun identifiant n'est renvoyé.",
    access: "public",
    body: {
      contentType: "multipart/form-data",
      description:
        "Champs de la fiche (`applicationFormSchema` de `@/modules/serving/schemas`, `pcncTrainings` répété), `photo` (image), `consent`, `turnstileToken`, `website` (piège, vide)",
    },
    status: 201,
    response: "`{ ok: true }`",
  },
});
