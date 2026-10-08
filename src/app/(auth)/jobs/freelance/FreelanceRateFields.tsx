"use client";

import Input from "@/components/ui/Input";

interface Props {
  readonly dailyRate: string;
  readonly onDailyRateChange: (value: string) => void;
  readonly hourlyRate: string;
  readonly onHourlyRateChange: (value: string) => void;
  /** Localisation demandée seulement hors full remote. */
  readonly remote: boolean;
  readonly location: string;
  readonly onLocationChange: (value: string) => void;
}

/** Tarifs (TJM, taux horaire) et localisation d'une mission ou d'un profil freelance. */
export default function FreelanceRateFields({
  dailyRate,
  onDailyRateChange,
  hourlyRate,
  onHourlyRateChange,
  remote,
  location,
  onLocationChange,
}: Props) {
  return (
    <>
      <Input
        label="TJM (taux journalier)"
        type="text"
        value={dailyRate}
        onChange={(e) => onDailyRateChange(e.target.value)}
        maxLength={100}
        placeholder="Ex: 400€, 300-500€, à définir"
      />

      <Input
        label="Taux horaire"
        type="text"
        value={hourlyRate}
        onChange={(e) => onHourlyRateChange(e.target.value)}
        maxLength={100}
        placeholder="Ex: 50€, 40-60€"
      />

      {!remote && (
        <div className="col-span-2">
          <Input
            label="Localisation"
            type="text"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            maxLength={150}
            placeholder="Ville, région..."
          />
        </div>
      )}
    </>
  );
}
