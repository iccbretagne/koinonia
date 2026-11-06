import { defineContract } from "@/lib/openapi/contract";
import { bookingCreateSchema } from "@/modules/ticketing/schemas";

export { bookingCreateSchema };

export const contract = defineContract({
  POST: {
    summary: "Inscription publique à un événement",
    description:
      "Sans compte. Turnstile obligatoire (refus si la vérification échoue ou n'est pas configurée), 5 demandes par minute et par IP, corps de 32 Ko au plus, champs inconnus refusés. En une transaction sous verrou de l'événement : inscriptions ouvertes (409 sinon), places et stock jamais dépassés (409), un adulte requis avec des mineurs (sauf autorisation de l'organisateur, alors responsable légal exigé), questions obligatoires, prix figés, référence `PREFIX-0042`, jetons dont seule l'empreinte est stockée. Lien vers le compte dont l'email correspond. Email immédiat : billets nominatifs, lien « Ma réservation », instructions de paiement.",
    access: "public",
    body: bookingCreateSchema,
    status: 201,
    response: "`{ reference, manageToken }`",
  },
});
