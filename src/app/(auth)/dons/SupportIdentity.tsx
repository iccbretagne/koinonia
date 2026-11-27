"use client";

import type { ReactNode } from "react";
import type { GivingNameSize } from "@/generated/prisma/enums";
import RadioGroup from "@/components/ui/RadioGroup";
import Switch from "@/components/ui/Switch";

const SIZES: readonly { value: GivingNameSize; label: string }[] = [
  { value: "SMALL", label: "Petit" },
  { value: "MEDIUM", label: "Moyen" },
  { value: "LARGE", label: "Grand" },
];

/** Réglages du nom et du logo d'un support (page ou slide), tels que tenus dans le brouillon. */
export interface IdentitySettings {
  readonly logoShown: boolean;
  readonly nameShown: boolean;
  readonly nameSize: GivingNameSize;
}

function Row({ label, hint, children }: { readonly label: string; readonly hint?: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-[22px] text-ink">{label}</p>
        {hint && <p className="text-[13px] leading-[18px] text-ink-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function SizeChoice({
  support,
  value,
  disabled,
  onChange,
}: {
  readonly support: string;
  readonly value: GivingNameSize;
  readonly disabled: boolean;
  readonly onChange: (next: GivingNameSize) => void;
}) {
  return (
    <RadioGroup
      legend={
        <>
          <span className="sr-only">{support} : </span>Taille du nom
        </>
      }
      variant="chips"
      value={value}
      disabled={disabled}
      onChange={onChange}
      options={SIZES}
    />
  );
}

/**
 * Affichage du logo et du nom de l'église, et taille du nom, pour un support (spec 066). Suit le
 * bouton « Enregistrer », contrairement au logo lui-même.
 */
export default function SupportIdentity({
  support,
  value,
  hasLogo,
  onChange,
}: {
  /** Nom du support, pour les libellés lus par les lecteurs d'écran. */
  readonly support: string;
  readonly value: IdentitySettings;
  readonly hasLogo: boolean;
  readonly onChange: (patch: Partial<IdentitySettings>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Row label="Afficher le logo" hint={hasLogo ? undefined : "Aucun logo déposé."}>
        <Switch
          checked={hasLogo && value.logoShown}
          disabled={!hasLogo}
          onChange={(v) => onChange({ logoShown: v })}
          label={`${support} : afficher le logo`} hideLabel
        />
      </Row>
      <Row label="Afficher le nom de l'église">
        <Switch checked={value.nameShown} onChange={(v) => onChange({ nameShown: v })} label={`${support} : afficher le nom`} hideLabel />
      </Row>
      <SizeChoice
        support={support}
        value={value.nameSize}
        disabled={!value.nameShown}
        onChange={(v) => onChange({ nameSize: v })}
      />
    </div>
  );
}
