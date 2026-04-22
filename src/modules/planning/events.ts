/**
 * Carte des événements émis par le module planning.
 *
 * Consommé par EventBus<PlanningEvents> — chaque clé est un nom d'événement,
 * la valeur est le type de payload attendu par les handlers.
 *
 * IMPORTANT : ces événements transitent par le bus in-process, transaction-aware.
 * Tout handler enregistré s'exécute dans la même transaction Prisma que l'émetteur.
 */
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

  /**
   * Le statut d'une Request a changé.
   * Émis depuis PATCH /api/requests/[id] lors de toute transition de statut.
   * Utilisé notamment pour déclencher la création d'un MediaProject quand
   * une Request VISUEL passe en EN_COURS.
   */
  "planning:request:status_changed": {
    requestId: string;
    requestType: string;
    churchId: string;
    oldStatus: string;
    newStatus: string;
    updatedById: string;
    title: string;
    /** Payload brut de la Request, pour utilisation par les handlers cross-module. */
    payload: Record<string, unknown>;
  };
}
