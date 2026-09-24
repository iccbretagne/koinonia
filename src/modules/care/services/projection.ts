/**
 * Confidentialité du contenu des demandes de rendez-vous pastoral (spec 052) — appliquée
 * **ici, une seule fois** : `message` et `subject` (le formulaire public y range les motifs
 * cochés, eux-mêmes sensibles) ne sont visibles qu'au référent, à l'Admin/Super Admin, ou à
 * l'accompagnant en charge. Tous les autres lecteurs (Secrétaire, Protocole, équipe
 * intégration, accompagnant dessaisi) reçoivent un libellé neutre. Fonctions pures : le
 * calcul de l'accompagnant en charge (identité, appartenance) reste à la charge de l'appelant.
 */

export const NEUTRAL_REQUEST_LABEL = "Rendez-vous pastoral";

export interface RequestReaderAccess {
  canReadContent: boolean;
}

/**
 * `canQualify` (référent, Admin, Super Admin) ou accompagnant en charge — le profil pastoral
 * assigné est rattaché au compte du lecteur, ou le lecteur est le membre du MSDP directement
 * affecté (spec 052, lot 2 : les deux populations d'accompagnants) — donnent accès au contenu.
 */
export function resolveRequestReaderAccess(params: {
  canQualify: boolean;
  currentUserId: string;
  assignedToUserId: string | null | undefined;
  assignedMemberId?: string | null | undefined;
}): RequestReaderAccess {
  const { canQualify, currentUserId, assignedToUserId, assignedMemberId } = params;
  const isCurrentAssignee =
    (!!assignedToUserId && assignedToUserId === currentUserId) ||
    (!!assignedMemberId && assignedMemberId === currentUserId);
  return { canReadContent: canQualify || isCurrentAssignee };
}

export type ProjectedRequest<T> =
  | (T & { masked: false })
  | (Omit<T, "subject" | "message"> & { subject: string; message: null; masked: true });

/** Fiche complète si `canReadContent`, sinon `subject`/`message` remplacés par un libellé neutre. */
export function projectRequest<T extends { subject: string; message: string }>(
  item: T,
  access: RequestReaderAccess
): ProjectedRequest<T> {
  if (access.canReadContent) return { ...item, masked: false };
  const { subject: _subject, message: _message, ...rest } = item;
  return { ...rest, subject: NEUTRAL_REQUEST_LABEL, message: null, masked: true };
}

/**
 * Projection pour la liste « à planifier » du Protocole (T19) : identité et état visibles,
 * jamais `subject` ni `message`, quel que soit le lecteur — le Protocole planifie sans lire
 * le motif du rendez-vous.
 */
export function projectForScheduling<T extends { subject: string; message: string }>(
  item: T
): Omit<T, "subject" | "message"> & { subject: string } {
  const { subject: _subject, message: _message, ...rest } = item;
  return { ...rest, subject: NEUTRAL_REQUEST_LABEL };
}
