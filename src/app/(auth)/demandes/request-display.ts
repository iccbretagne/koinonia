import {
  CalendarPlus,
  CalendarX2,
  ClipboardList,
  FileText,
  KeyRound,
  Megaphone,
  Palette,
  PencilLine,
  Share2,
  type LucideIcon,
} from "lucide-react";
import type { StatusTone } from "@/components/ui/StatusChip";

/**
 * Libellés, pictogrammes et tonalités des demandes (« Mes demandes », accueil « Aujourd'hui ») :
 * une seule source pour que la même demande se lise pareil partout. Le mot du statut est
 * toujours affiché (`StatusChip`), la couleur n'est jamais seule.
 */
export const REQUEST_TYPE_LABEL: Record<string, string> = {
  VISUEL: "Visuel",
  DIFFUSION_INTERNE: "Diffusion interne",
  RESEAUX_SOCIAUX: "Réseaux sociaux",
  AJOUT_EVENEMENT: "Ajout d'événement",
  MODIFICATION_EVENEMENT: "Modification d'événement",
  ANNULATION_EVENEMENT: "Annulation d'événement",
  MODIFICATION_PLANNING: "Modification de planning",
  DEMANDE_ACCES: "Demande d'accès",
};

export const REQUEST_TYPE_ICON: Record<string, LucideIcon> = {
  VISUEL: Palette,
  DIFFUSION_INTERNE: Megaphone,
  RESEAUX_SOCIAUX: Share2,
  AJOUT_EVENEMENT: CalendarPlus,
  MODIFICATION_EVENEMENT: PencilLine,
  ANNULATION_EVENEMENT: CalendarX2,
  MODIFICATION_PLANNING: ClipboardList,
  DEMANDE_ACCES: KeyRound,
};

export function requestTypeIcon(type: string): LucideIcon {
  return REQUEST_TYPE_ICON[type] ?? FileText;
}

export const REQUEST_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  EN_ATTENTE: { label: "En attente", tone: "warning" },
  EN_COURS: { label: "En cours", tone: "info" },
  APPROUVEE: { label: "Approuvée", tone: "success" },
  EXECUTEE: { label: "Exécutée", tone: "success" },
  LIVRE: { label: "Livré", tone: "success" },
  REFUSEE: { label: "Refusée", tone: "danger" },
  ANNULE: { label: "Annulé", tone: "neutral" },
  ERREUR: { label: "Erreur", tone: "danger" },
};

export function requestStatus(status: string): { label: string; tone: StatusTone } {
  return REQUEST_STATUS[status] ?? { label: status, tone: "neutral" };
}

/** Rendez-vous pastoraux (module `care`), listés en tête de « Mes demandes ». */
export const APPOINTMENT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  PENDING: { label: "En attente", tone: "warning" },
  VALIDATED: { label: "Confiée", tone: "info" },
  SCHEDULED: { label: "Planifiée", tone: "success" },
  CLOSED: { label: "Terminée", tone: "neutral" },
  REJECTED: { label: "Refusée", tone: "danger" },
};

export function appointmentStatus(status: string): { label: string; tone: StatusTone } {
  return APPOINTMENT_STATUS[status] ?? { label: status, tone: "neutral" };
}
