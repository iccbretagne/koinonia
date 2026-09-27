"use client";

import { ChevronRight, FileCheck2, FileWarning } from "lucide-react";
import StatusChip from "@/components/ui/StatusChip";
import OpeningClosingManager, { type OpeningClosingData } from "./OpeningClosingManager";
import AnnouncementSheetManager, { type AnnouncementSheetData } from "./AnnouncementSheetManager";

interface Props {
  readonly eventId: string;
  readonly openingClosing: OpeningClosingData;
  readonly announcementSheet: AnnouncementSheetData;
  readonly onOpeningClosingChange: (data: OpeningClosingData) => void;
  readonly onAnnouncementSheetChange: (data: AnnouncementSheetData) => void;
}

/**
 * Bandeau d'actions de préparation du culte (ouverture/fermeture, trame des annonces),
 * replié par défaut, affiché au-dessus du planning (spec 043). Les noms des personnes
 * désignées restent dans l'en-tête du planning — ce bandeau ne regroupe que les actions,
 * pour ne pas les doublonner.
 */
export default function PreparationBanner({
  eventId,
  openingClosing,
  announcementSheet,
  onOpeningClosingChange,
  onAnnouncementSheetChange,
}: Props) {
  const showOpeningClosing = openingClosing.canManage;
  const showAnnouncementSheet = announcementSheet.canDeposit || announcementSheet.canRead;

  if (!showOpeningClosing && !showAnnouncementSheet) return null;

  return (
    <details className="group rounded-card border border-line bg-surface print:hidden">
      <summary className="flex min-h-11 cursor-pointer select-none list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-ink-subtle transition-transform group-open:rotate-90 motion-reduce:transition-none"
          strokeWidth={1.75}
        />
        <span className="flex-1 font-display text-[15px] font-semibold text-ink">Préparation du culte</span>
        {showAnnouncementSheet &&
          (announcementSheet.filename ? (
            <StatusChip tone="success" icon={FileCheck2}>Trame déposée</StatusChip>
          ) : (
            <StatusChip tone="warning" icon={FileWarning}>Trame non déposée</StatusChip>
          ))}
      </summary>
      <div className="divide-y divide-line border-t border-line px-4 pb-4">
        {showAnnouncementSheet && (
          <div className="pt-4">
            <AnnouncementSheetManager
              eventId={eventId}
              data={announcementSheet}
              onChange={onAnnouncementSheetChange}
              embedded
            />
          </div>
        )}
        {showOpeningClosing && (
          <div className="pt-4">
            <OpeningClosingManager
              eventId={eventId}
              data={openingClosing}
              onChange={onOpeningClosingChange}
              embedded
            />
          </div>
        )}
      </div>
    </details>
  );
}
