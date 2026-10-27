import type { ChurchLogoSources } from "@/modules/core/schemas";

/**
 * Marque de la coquille (spec 072) : logo de l'église courante, ou plumes ICC sans logo. Les deux
 * versions sont rendues et la variante `dark:` (thème effectif, `globals.css`) choisit la bonne :
 * aucun flash au chargement ni au changement de thème.
 */
export default function ChurchMark({
  logo,
  className,
}: {
  readonly logo: ChurchLogoSources | null;
  /** Hauteur de l'emplacement (`h-7`, `h-9`…) ; la largeur suit les proportions. */
  readonly className: string;
}) {
  if (!logo) {
    // eslint-disable-next-line @next/next/no-img-element -- SVG statique, pas d'optimisation utile
    return <img src="/brand/icc-plumes.svg" alt="" width={36} height={36} className={`${className} w-auto shrink-0`} />;
  }
  const sized = `${className} w-auto max-w-[140px] shrink-0 object-contain`;
  if (logo.dark === logo.light) {
    // eslint-disable-next-line @next/next/no-img-element -- logo servi par Koinonia, proportions libres
    return <img src={logo.light} alt="" className={sized} />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- logo servi par Koinonia, proportions libres */}
      <img src={logo.light} alt="" className={`${sized} dark:hidden`} />
      {/* eslint-disable-next-line @next/next/no-img-element -- logo servi par Koinonia, proportions libres */}
      <img src={logo.dark} alt="" className={`${sized} hidden dark:block`} />
    </>
  );
}
