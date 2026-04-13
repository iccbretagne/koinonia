/**
 * Carte des événements émis par le module planning.
 *
 * Consommé par EventBus<PlanningEvents> — chaque clé est un nom d'événement,
 * la valeur est le type de payload attendu par les handlers.
 *
 * IMPORTANT : ces événements transitent par le bus in-process, transaction-aware.
 * Tout handler enregistré s'exécute dans la même transaction Prisma que l'émetteur.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PlanningEvents = {
  /** Un événement unique a été créé (ou le parent d'une série récurrente). */
  "planning:event:created": {
    eventId: string;
    churchId: string;
    title: string;
    type: string;
    createdById: string;
    isRecurrenceParent: boolean;
    childCount?: number;
  };

  /** Un événement a été annulé (suppression douce ou via demande). */
  "planning:event:cancelled": {
    eventId: string;
    churchId: string;
    cancelledById: string;
    requestId?: string;
  };

  /** Une demande (Request) a été approuvée et exécutée avec succès. */
  "planning:request:executed": {
    requestId: string;
    requestType: string;
    churchId: string;
    executedById: string;
    /** Identifiant de la ressource créée/modifiée, si applicable. */
    resourceId?: string;
  };

  /** Le statut de planning d'un membre a été modifié. */
  "planning:status:changed": {
    eventId: string;
    churchId: string;
    departmentId: string;
    memberId: string;
    newStatus: string | null;
    changedById: string;
  };
}
