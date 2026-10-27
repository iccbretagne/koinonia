/* eslint-disable @next/next/no-img-element -- aperçus en data URL ou servis par /api/app-icon, hors next/image */

export interface AppIconPreviewImages {
  /** Icône pleine (192 ou apple-touch). */
  readonly icon: string;
  /** Variante masquable (zone sûre de 72 %). */
  readonly maskable: string;
  readonly favicon: string;
  /** Silhouette blanche des notifications Android. */
  readonly badge: string;
}

/** Fond d'une notification Android, sombre dans les deux thèmes comme sur un téléphone. */
const NOTIFICATION_BACKGROUND = "#24212c";

function Shape({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="grid h-24 place-items-center">{children}</div>
      <figcaption className="text-[13px] leading-[18px] text-ink-muted">{label}</figcaption>
    </figure>
  );
}

/**
 * L'icône telle que la verront les utilisateurs (spec 069) : écran d'accueil iPhone (coins
 * arrondis), Android (découpe ronde de la variante masquable), onglet du navigateur et
 * notification Android (silhouette blanche).
 */
export default function AppIconPreview({ images }: { readonly images: AppIconPreviewImages }) {
  return (
    <div className="grid grid-cols-2 gap-4 rounded-card bg-surface-sunken p-4 sm:grid-cols-4">
      <Shape label="iPhone">
        <img src={images.icon} alt="" width={72} height={72} className="size-[72px] rounded-[22%] shadow-card" />
      </Shape>
      <Shape label="Android">
        <img src={images.maskable} alt="" width={72} height={72} className="size-[72px] rounded-full shadow-card" />
      </Shape>
      <Shape label="Onglet">
        <div className="flex items-center gap-2 rounded-t-lg border border-b-0 border-line bg-surface px-3 py-2">
          <img src={images.favicon} alt="" width={16} height={16} className="size-4" />
          <span className="text-[13px] text-ink">Koinonia</span>
          <img src={images.favicon} alt="" width={32} height={32} className="ml-2 size-8 rounded" />
        </div>
      </Shape>
      <Shape label="Notification">
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2 shadow-card"
          style={{ backgroundColor: NOTIFICATION_BACKGROUND }}
        >
          <img src={images.badge} alt="" width={20} height={20} className="size-5" />
          <span className="h-2 w-10 rounded-full opacity-40" style={{ backgroundColor: "#ffffff" }} />
          <img src={images.icon} alt="" width={32} height={32} className="size-8 rounded-full" />
        </div>
      </Shape>
    </div>
  );
}
