import type { Prisma } from "@/generated/prisma/client";

/**
 * Forme du payload de l'événement `request.submitted` d'`integration` — recopiée ici plutôt
 * qu'importée de `@/modules/integration/events` : aucun import entre modules, même de type
 * (ADR-0001, `.dependency-cruiser.cjs`). Les deux copies doivent rester synchrones ; c'est le
 * contrat de l'événement qui fait foi (documenté dans les deux modules).
 */
export interface IntegrationRequestSubmittedPayload {
  requestId: string;
  churchId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  salvationCall: boolean;
  pastoralCare: { message: string } | null;
  personJourneyId: string | null;
}

/**
 * Réaction à `integration:request.submitted` (spec 052, ADR-0015) : crée, **une fois**, la
 * demande de rendez-vous pastoral (si soin pastoral demandé) et le suivi de nouveau converti
 * (si appel au salut), rattachés au dossier de parcours quand il existe. Idempotent par les
 * index uniques `sourceIntegrationRequestId` (AppointmentRequest) et `requestId`
 * (MsdpFollowUp) — une seconde émission (retry, double clic) ne crée rien de plus.
 */
export async function handleIntegrationSubmitted(
  tx: Prisma.TransactionClient,
  payload: IntegrationRequestSubmittedPayload
): Promise<void> {
  const { churchId, firstName, lastName, phone, email, personJourneyId } = payload;

  if (payload.pastoralCare) {
    await tx.appointmentRequest.upsert({
      where: { sourceIntegrationRequestId: payload.requestId },
      update: {},
      create: {
        churchId,
        firstName,
        lastName,
        email,
        phone,
        subject: "Soins pastoraux (demande intégration famille)",
        message:
          payload.pastoralCare.message ||
          "Demande de soin pastoral via formulaire d'intégration famille.",
        sourceIntegrationRequestId: payload.requestId,
        personJourneyId,
      },
    });
  }

  if (payload.salvationCall) {
    await tx.msdpFollowUp.upsert({
      where: { requestId: payload.requestId },
      update: {},
      create: {
        churchId,
        requestId: payload.requestId,
        firstName,
        lastName,
        phone,
        email,
        personJourneyId,
      },
    });
  }
}
