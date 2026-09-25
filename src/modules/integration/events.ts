export type IntegrationEvents = {
  /**
   * Émis dans la transaction de `POST /api/integration/requests` (spec 052, ADR-0015) — une
   * personne a répondu à l'appel au salut et/ou demandé un soin pastoral via le formulaire
   * d'accueil. `integration` se contente d'annoncer ; c'est `care` (s'il est actif) qui crée la
   * demande de rendez-vous et/ou le suivi de nouveau converti correspondants.
   */
  "request.submitted": {
    requestId: string;
    churchId: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    salvationCall: boolean;
    pastoralCare: { message: string } | null;
    personJourneyId: string | null;
  };
  "family.assigned": {
    requestId: string;
    churchId: string;
    bergerId: string;
    familyId: number;
    familyName: string;
  };
  "family.contacted":     { requestId: string; churchId: string };
  "family.whatsapp_added":{ requestId: string; churchId: string };
  "family.integrated":    { requestId: string; churchId: string };
  "family.abandoned":     { requestId: string; churchId: string; reason?: string };
  "family.reopened":      { requestId: string; churchId: string };
};
