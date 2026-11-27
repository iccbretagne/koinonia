"use client";

import { useState, type ComponentProps } from "react";
import { X } from "lucide-react";
import { Button, Checkbox, IconButton } from "@/components/ui";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import SiteRenderer from "@/app/site/_components/SiteRenderer";

const DEVICES = [
  { key: "mobile", label: "Mobile", width: 390 },
  { key: "tablet", label: "Tablette", width: 768 },
  { key: "desktop", label: "Ordinateur", width: null },
] as const;
type Device = (typeof DEVICES)[number]["key"];

type RendererProps = Omit<ComponentProps<typeof SiteRenderer>, "pageSlug" | "onNavigate" | "ended">;

/**
 * Aperçu plein écran du brouillon (spec 084) : largeur Mobile, Tablette ou Ordinateur, navigation
 * entre les pages, page « Événement terminé ». Le site s'adapte à la largeur de son conteneur
 * (requêtes de conteneur), donc l'aperçu mobile est fidèle sans iframe. Rien n'est enregistré.
 */
export default function SitePreviewDialog({
  open,
  onClose,
  renderer,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly renderer: RendererProps;
}) {
  const dialogRef = useModalDialog(open);
  const [device, setDevice] = useState<Device>("mobile");
  const [page, setPage] = useState<string | undefined>();
  const [ended, setEnded] = useState(false);
  if (!open) return null;
  const width = DEVICES.find((d) => d.key === device)?.width ?? null;

  return (
    <dialog
      ref={dialogRef}
      aria-label="Aperçu du site"
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-bg p-0 text-ink"
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <h2 className="mr-2 font-display text-[15px] font-semibold">Aperçu du brouillon</h2>
          <div role="radiogroup" aria-label="Largeur d'écran" className="flex gap-1">
            {DEVICES.map((d) => (
              <Button key={d.key} type="button" size="sm" variant={device === d.key ? "primary" : "secondary"} role="radio" aria-checked={device === d.key} onClick={() => setDevice(d.key)}>
                {d.label}
              </Button>
            ))}
          </div>
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <Checkbox checked={ended} onChange={(e) => setEnded(e.target.checked)} />
            Événement terminé
          </label>
          <p className="ml-auto hidden text-[13px] text-ink-muted md:block">Rien n&apos;est publié depuis cet aperçu.</p>
          <IconButton icon={X} aria-label="Fermer l'aperçu" onClick={onClose} className="ml-auto md:ml-0" />
        </div>
        <div className="flex-1 overflow-auto p-3 md:p-6">
          <div
            className="mx-auto overflow-hidden rounded-card border border-line bg-surface shadow-card"
            style={width ? { width: `min(${width}px, 100%)` } : undefined}
          >
            <SiteRenderer {...renderer} pageSlug={page} onNavigate={setPage} ended={ended} />
          </div>
        </div>
      </div>
    </dialog>
  );
}
