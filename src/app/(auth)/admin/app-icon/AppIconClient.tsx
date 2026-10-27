"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, ImageUp, RotateCcw } from "lucide-react";
import { Alert, Button, ConfirmModal, StatusChip, useToast } from "@/components/ui";
import type { AppIconPreview as PreviewData, AppIconState } from "@/modules/core";
import { APP_ICON_MAX_BYTES } from "@/modules/core/schemas";
import AppIconPreview from "./AppIconPreview";

const HEX = /^#[0-9a-fA-F]{6}$/;

const ANNOUNCEMENT =
  "Koinonia a une nouvelle icône ! Sur Android, elle apparaîtra d'elle-même dans les prochains jours. " +
  "Sur iPhone, pour la voir : appuyez longuement sur l'icône Koinonia, supprimez-la de l'écran d'accueil, " +
  "puis rouvrez Koinonia dans Safari et touchez Partager, puis « Sur l'écran d'accueil ».";

const ACTION_LABEL: Record<string, string> = { CREATE: "Dépôt", UPDATE: "Remplacement", DELETE: "Retrait" };

function currentImages(state: AppIconState) {
  const url = (variant: string) => `/api/app-icon/${variant}.png?v=${state.version}`;
  return { icon: url("icon-192"), maskable: url("icon-maskable-512"), favicon: url("favicon-48"), badge: url("badge-96") };
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });

async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Opération impossible. Réessayez dans un instant.";
}

/** Écran « Icône de l'application » (spec 069) : icône en vigueur, dépôt avec aperçu, historique. */
export default function AppIconClient({ initialState }: { readonly initialState: AppIconState }) {
  const toast = useToast();
  const router = useRouter();
  const id = useId();
  const [state, setState] = useState(initialState);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [badgeFile, setBadgeFile] = useState<File | null>(null);
  const [background, setBackground] = useState(initialState.background ?? "#ffffff");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"icon" | "badge" | null>(null);
  const [fileKey, setFileKey] = useState(0);

  async function requestPreview(next: { icon: File | null; badge: File | null; background?: string }) {
    setError(null);
    if (!next.icon && !next.badge) {
      setPreview(null);
      return;
    }
    const tooBig = [next.icon, next.badge].find((f) => f && f.size > APP_ICON_MAX_BYTES);
    if (tooBig) {
      setError("Le fichier dépasse 5 Mo.");
      return;
    }
    const form = new FormData();
    if (next.icon) form.append("icon", next.icon);
    if (next.badge) form.append("badge", next.badge);
    if (next.background) form.append("background", next.background);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/app-icon/preview", { method: "POST", body: form });
      if (!res.ok) {
        setPreview(null);
        setError(await errorMessage(res));
        return;
      }
      const data = (await res.json()) as PreviewData;
      setPreview(data);
      if (next.icon) setBackground(data.background);
    } catch {
      setError("Aperçu impossible. Vérifiez votre connexion.");
    } finally {
      setBusy(false);
    }
  }

  function pickIcon(file: File | null) {
    setIconFile(file);
    void requestPreview({ icon: file, badge: badgeFile });
  }

  function pickBadge(file: File | null) {
    setBadgeFile(file);
    void requestPreview({ icon: iconFile, badge: file, background: iconFile ? background : undefined });
  }

  function reset() {
    setIconFile(null);
    setBadgeFile(null);
    setPreview(null);
    setError(null);
    setFileKey((k) => k + 1);
  }

  async function save() {
    const form = new FormData();
    if (iconFile) {
      form.append("icon", iconFile);
      form.append("background", background);
    }
    if (badgeFile) form.append("badge", badgeFile);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/app-icon", { method: "PUT", body: form });
      if (!res.ok) {
        setError(await errorMessage(res));
        return;
      }
      setState((await res.json()) as AppIconState);
      setBackground(background);
      reset();
      toast.success("Nouvelle icône en place");
      router.refresh();
    } catch {
      setError("Enregistrement impossible. Vérifiez votre connexion.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: "icon" | "badge") {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/app-icon", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) {
        toast.error(await errorMessage(res));
        return;
      }
      setState((await res.json()) as AppIconState);
      toast.success(target === "icon" ? "Icône par défaut rétablie" : "Silhouette retirée");
      router.refresh();
    } catch {
      toast.error("Opération impossible. Vérifiez votre connexion.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function copyAnnouncement() {
    try {
      await navigator.clipboard.writeText(ANNOUNCEMENT);
      toast.success("Message copié");
    } catch {
      toast.error("Copie impossible : sélectionnez le texte à la main.");
    }
  }

  const current = currentImages(state);
  const previewImages =
    preview && (preview.variants["icon-192"] || preview.badge)
      ? {
          icon: preview.variants["icon-192"] ?? current.icon,
          maskable: preview.variants["icon-maskable-512"] ?? current.maskable,
          favicon: preview.variants["favicon-48"] ?? current.favicon,
          badge: preview.badge ?? (preview.variants["icon-192"] && !state.hasBadge ? "/brand/badge-bell-96.png" : current.badge),
        }
      : null;
  const backgroundChanged = iconFile !== null && preview !== null && preview.background !== background;
  const canSave = (iconFile !== null || (badgeFile !== null && state.custom)) && preview !== null && !busy;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby={`${id}-current`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${id}-current`} className="font-display text-[17px] font-semibold leading-6 text-ink">
            Icône en vigueur
          </h2>
          <StatusChip tone={state.custom ? "info" : "neutral"}>{state.custom ? "Personnalisée" : "Par défaut"}</StatusChip>
        </div>
        <AppIconPreview images={current} />
        {state.custom && state.updatedAt && (
          <p className="text-[13px] leading-[18px] text-ink-muted">
            Modifiée le {formatDate(state.updatedAt)} par {state.updatedBy}.
            {!state.hasBadge && " Notifications : cloche générique, aucune silhouette déposée."}
          </p>
        )}
        {state.custom && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setConfirm("icon")} disabled={busy}>
              <RotateCcw aria-hidden="true" className="size-4" />
              Revenir à l&apos;icône par défaut
            </Button>
            {state.hasBadge && (
              <Button variant="ghost" onClick={() => setConfirm("badge")} disabled={busy}>
                Retirer la silhouette
              </Button>
            )}
          </div>
        )}
      </section>

      <section
        aria-labelledby={`${id}-upload`}
        className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5"
      >
        <h2 id={`${id}-upload`} className="font-display text-[17px] font-semibold leading-6 text-ink">
          Déposer une icône
        </h2>
        <ul className="list-disc pl-5 text-[13px] leading-[18px] text-ink-muted">
          <li>Image carrée PNG, JPEG ou WebP, 512 × 512 px au moins (1024 × 1024 conseillé), 5 Mo au plus.</li>
          <li>Sujet centré avec une marge : Android découpe l&apos;icône en rond.</li>
          <li>Fond plein : la transparence et les coins clairs sont remplis par la couleur de fond.</li>
          <li>Pas de petit texte : il devient illisible à la taille d&apos;un onglet.</li>
        </ul>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-icon`} className="text-sm font-medium text-ink">
            Icône
          </label>
          <input
            key={`icon-${fileKey}`}
            id={`${id}-icon`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => pickIcon(e.target.files?.[0] ?? null)}
            disabled={busy}
            className="block text-sm text-ink-muted"
          />
        </div>

        {iconFile && preview && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-bg`} className="text-sm font-medium text-ink">
              Couleur de fond (coins et transparence)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id={`${id}-bg`}
                type="color"
                value={HEX.test(background) ? background : "#ffffff"}
                onChange={(e) => setBackground(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded border border-line p-0.5"
              />
              <input
                type="text"
                aria-label="Couleur de fond en hexadécimal"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                className="w-32 rounded-lg border border-control-line bg-surface px-3 py-2 font-mono text-sm text-ink focus:border-brand focus:outline-none"
              />
              {backgroundChanged && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || !HEX.test(background)}
                  onClick={() => requestPreview({ icon: iconFile, badge: badgeFile, background })}
                >
                  Actualiser l&apos;aperçu
                </Button>
              )}
            </div>
            <p className="text-[13px] leading-[18px] text-ink-muted">Proposée d&apos;après le bord de l&apos;image.</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-badge`} className="text-sm font-medium text-ink">
            Silhouette des notifications (facultatif)
          </label>
          <input
            key={`badge-${fileKey}`}
            id={`${id}-badge`}
            type="file"
            accept="image/png,image/webp"
            onChange={(e) => pickBadge(e.target.files?.[0] ?? null)}
            disabled={busy || (!state.custom && !iconFile)}
            className="block text-sm text-ink-muted"
          />
          <p className="text-[13px] leading-[18px] text-ink-muted">
            Forme blanche sur fond transparent (PNG ou WebP), affichée en petit dans la barre d&apos;état Android.
            Sans silhouette, une cloche s&apos;affiche.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {previewImages && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-ink">Aperçu</p>
            <AppIconPreview images={previewImages} />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={!canSave || backgroundChanged}>
            <ImageUp aria-hidden="true" className="size-4" />
            {busy ? "Préparation…" : "Enregistrer l'icône"}
          </Button>
          {(iconFile || badgeFile) && (
            <Button variant="ghost" onClick={reset} disabled={busy}>
              Annuler
            </Button>
          )}
        </div>
      </section>

      <Alert tone="info" title="Les téléphones ne se mettent pas tous à jour seuls.">
        <p>
          Onglets et notifications prennent la nouvelle icône dans l&apos;heure. Sur Android, l&apos;application
          installée se met à jour d&apos;elle-même, en général sous quelques jours. Sur iPhone, une application déjà
          installée garde son ancienne icône : il faut la supprimer de l&apos;écran d&apos;accueil puis la réajouter.
        </p>
        <p className="mt-2 italic">{ANNOUNCEMENT}</p>
        <div className="mt-2">
          <Button variant="ghost" size="sm" onClick={copyAnnouncement}>
            <Copy aria-hidden="true" className="size-4" />
            Copier le message
          </Button>
        </div>
      </Alert>

      <section aria-labelledby={`${id}-history`} className="flex flex-col gap-3">
        <h2 id={`${id}-history`} className="font-display text-[17px] font-semibold leading-6 text-ink">
          Historique
        </h2>
        {state.history.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucun changement d&apos;icône pour l&apos;instant.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
            {state.history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <span className="text-sm text-ink">
                  {ACTION_LABEL[entry.action] ?? entry.action} {entry.target === "badge" ? "de la silhouette" : "de l'icône"}
                  <span className="text-ink-muted"> · {entry.author}</span>
                </span>
                <time dateTime={entry.createdAt} className="text-[13px] text-ink-muted">
                  {formatDate(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={confirm === "icon"}
        title="Revenir à l'icône par défaut ?"
        message="L'icône livrée avec Koinonia s'appliquera à nouveau pour tout le monde, silhouette comprise."
        confirmLabel="Revenir à l'icône par défaut"
        confirming={busy}
        onConfirm={() => remove("icon")}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === "badge"}
        title="Retirer la silhouette ?"
        message="Les notifications Android afficheront une cloche à la place."
        confirmLabel="Retirer la silhouette"
        confirming={busy}
        onConfirm={() => remove("badge")}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
