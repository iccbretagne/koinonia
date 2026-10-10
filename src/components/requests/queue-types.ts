import {
  CalendarClock,
  CalendarPlus,
  CalendarX,
  ClipboardList,
  FileText,
  KeyRound,
  Megaphone,
  Palette,
  Share2,
  type LucideIcon,
} from "lucide-react";
import type { RequestStatus } from "@/generated/prisma/client";
import type { QueueItem } from "@/modules/planning";
import type { StatusTone } from "@/components/ui/StatusChip";

export type { QueueItem };

/** Modification envoyée à la demande (corps du PATCH, hors `expectedStatus`). */
export interface RequestChange {
  readonly status?: RequestStatus;
  readonly reviewNotes?: string;
  readonly deliveryLink?: string;
  readonly payload?: Record<string, unknown>;
}

export interface ActOptions {
  /** Message du toast de confirmation. */
  readonly success: string;
  /**
   * Retour arrière proposé dans le toast (spec 063) : uniquement pour un changement d'état sans
   * effet. Corps renvoyé pour revenir à l'état précédent.
   */
  readonly undo?: RequestChange;
}

/** Ce qu'un panneau de détail reçoit pour agir sur la demande affichée. */
export interface DetailContext {
  readonly busy: boolean;
  /** Applique la modification ; renvoie `false` si elle a échoué (toast déjà affiché). */
  act(change: RequestChange, options: ActOptions): Promise<boolean>;
  /** Suppression définitive d'une demande traitée (Super Admin, Admin, Secrétaire). */
  remove(): Promise<boolean>;
}

const TYPE_ICON: Record<string, LucideIcon> = {
  DIFFUSION_INTERNE: Megaphone,
  RESEAUX_SOCIAUX: Share2,
  VISUEL: Palette,
  AJOUT_EVENEMENT: CalendarPlus,
  MODIFICATION_EVENEMENT: CalendarClock,
  ANNULATION_EVENEMENT: CalendarX,
  MODIFICATION_PLANNING: ClipboardList,
  DEMANDE_ACCES: KeyRound,
};

export function requestTypeIcon(type: string): LucideIcon {
  return TYPE_ICON[type] ?? FileText;
}

export const STATUS_TONE: Record<string, StatusTone> = {
  EN_ATTENTE: "warning",
  EN_COURS: "info",
  APPROUVEE: "success",
  EXECUTEE: "success",
  LIVRE: "success",
  REFUSEE: "danger",
  ANNULE: "neutral",
  ERREUR: "danger",
};

/** Libellé d'un statut ; `doneLabel` nomme l'état terminé propre à l'équipe (Diffusée, Publiée, Livré). */
export function statusLabel(status: string, doneLabel: string): string {
  switch (status) {
    case "EN_ATTENTE":
      return "En attente";
    case "EN_COURS":
      return "En cours";
    case "APPROUVEE":
      return "Approuvée";
    case "EXECUTEE":
      return "Exécutée";
    case "LIVRE":
      return doneLabel;
    case "REFUSEE":
      return "Refusée";
    case "ANNULE":
      return "Annulée";
    case "ERREUR":
      return "Erreur";
    default:
      return status;
  }
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTimeFmt.format(d);
}

export function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : typeof value === "number" ? String(value) : null;
}
