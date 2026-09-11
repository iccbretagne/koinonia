"use client";

import OpeningClosingManager, { type OpeningClosingData } from "./OpeningClosingManager";
import AnnouncementSheetManager, { type AnnouncementSheetData } from "./AnnouncementSheetManager";

interface Props {
  eventId: string;
  openingClosing: OpeningClosingData;
  announcementSheet: AnnouncementSheetData;
  onOpeningClosingChange: (data: OpeningClosingData) => void;
  onAnnouncementSheetChange: (data: AnnouncementSheetData) => void;
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
    <details className="group mb-6 bg-white rounded-lg shadow print:hidden">
      <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none min-h-[44px] list-none [&::-webkit-details-marker]:hidden">
        <svg
          className="w-4 h-4 text-gray-400 shrink-0 transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold text-gray-900 flex-1">Préparation du culte</span>
        {showAnnouncementSheet && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
              announcementSheet.filename
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {announcementSheet.filename ? "Trame déposée" : "Trame non déposée"}
          </span>
        )}
      </summary>
      <div className="divide-y divide-gray-100 border-t border-gray-100 px-4 pb-4">
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
