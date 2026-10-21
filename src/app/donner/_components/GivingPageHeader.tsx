import type { GivingNameSize } from "@/generated/prisma/enums";
import { CHURCH_NAME_CLASSES } from "./church-name";

/**
 * En-tête de la page de dons (spec 066) : logo, nom de l'église selon sa taille, titre
 * « Donner ». Seule source de l'en-tête, partagée par la page publique et l'aperçu du
 * paramétrage : sans état ni dépendance serveur.
 */
export default function GivingPageHeader({
  churchName,
  nameSize,
  logoSrc,
  compact = false,
}: {
  readonly churchName: string;
  /** `null` : nom masqué. */
  readonly nameSize: GivingNameSize | null;
  readonly logoSrc: string | null;
  readonly compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {logoSrc && (
        // Logo servi par Koinonia (même origine), dimensions variables : pas d'optimisation next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt=""
          className={`${compact ? "h-8" : "h-10"} w-auto max-w-[140px] shrink-0 object-contain`}
        />
      )}
      <div className="min-w-0">
        {nameSize && <p className={`mb-1 ${CHURCH_NAME_CLASSES[nameSize]}`}>{churchName}</p>}
        {compact ? (
          // Aperçu dans le paramétrage : la page a déjà son propre titre principal.
          <p className="font-display text-[22px] font-bold leading-7 text-on-brand">Donner</p>
        ) : (
          <h1 className="font-display text-[28px] font-bold leading-[34px] text-on-brand">Donner</h1>
        )}
      </div>
    </div>
  );
}
