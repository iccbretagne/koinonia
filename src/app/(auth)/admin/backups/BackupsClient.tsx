"use client";

import { useState, useEffect } from "react";
import { Alert, Button, EmptyState, Modal, SkeletonList } from "@/components/ui";

type BackupEntry = {
  key: string;
  lastModified: string;
  sizeBytes: number;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function keyToLabel(key: string) {
  // key = "backups/2026-04-23T14-30-00Z/db.sql.gz"
  const match = /backups\/(.+?)\/db\.sql\.gz$/.exec(key);
  if (!match) return key;
  return match[1].replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, " $1:$2:$3 UTC");
}

// ─── Restore confirmation modal ──────────────────────────────────────────────

function RestoreModal({
  backup,
  onCancel,
  onConfirm,
  loading,
}: {
  readonly backup: BackupEntry;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly loading: boolean;
}) {
  const [step, setStep] = useState<1 | 2>(1);

  return (
    <Modal open onClose={onCancel} title={step === 1 ? "Restaurer une sauvegarde" : "Confirmation finale"}>
      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <Alert tone="danger" title="Cette action est irréversible.">
            <ul className="list-disc space-y-1 pl-4">
              <li>Toutes les données actuelles seront <strong>écrasées</strong> par cette sauvegarde.</li>
              <li>Les modifications effectuées depuis la date de sauvegarde seront <strong>perdues définitivement</strong>.</li>
              <li>L&apos;application sera indisponible pendant la restauration.</li>
            </ul>
          </Alert>
          <div className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">Sauvegarde sélectionnée :</span>
            <br />
            <span className="text-[13px]">{keyToLabel(backup.key)}</span>
            <span className="ml-2 text-[13px]">({formatBytes(backup.sizeBytes)})</span>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onCancel}>Annuler</Button>
            <Button onClick={() => setStep(2)}>Continuer</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-[22px] text-ink-muted">
            Confirmez-vous la restauration de la base de données vers la sauvegarde du{" "}
            <strong className="text-ink">{formatDate(backup.lastModified)}</strong> ?
          </p>
          <Alert tone="danger">Toutes les données actuelles seront définitivement perdues.</Alert>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onCancel} disabled={loading}>Annuler</Button>
            <Button variant="danger" onClick={onConfirm} disabled={loading}>
              {loading ? "Restauration…" : "Restaurer la sauvegarde"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BackupsClient() {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ success: boolean; message: string } | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentRefreshKey, setCurrentRefreshKey] = useState(0);

  // Reset loading/error during render when a refresh is requested (avoids synchronous setState in effect)
  if (currentRefreshKey !== refreshKey) {
    setCurrentRefreshKey(refreshKey);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/admin/backups");
        if (!mounted) return;
        if (res.ok) {
          const data = await res.json();
          if (mounted) setBackups(data);
        } else {
          const json = await res.json().catch(() => ({}));
          if (mounted) setError(json.error ?? "Impossible de charger les sauvegardes");
        }
      } catch {
        if (mounted) setError("Impossible de charger les sauvegardes");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [refreshKey]);

  async function triggerBackup() {
    setTriggering(true);
    setTriggerResult(null);
    const res = await fetch("/api/admin/backups", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTriggerResult(`Erreur : ${json.error ?? "échec de la sauvegarde"}`);
    } else {
      setTriggerResult(`Sauvegarde créée : ${keyToLabel(json.key)} (${formatBytes(json.sizeBytes)})`);
      setRefreshKey((k) => k + 1);
    }
    setTriggering(false);
  }

  async function downloadBackup(b: BackupEntry) {
    setDownloadingKey(b.key);
    const res = await fetch(`/api/admin/backups/download?key=${encodeURIComponent(b.key)}`);
    const json = await res.json().catch(() => ({}));
    setDownloadingKey(null);
    if (!res.ok) {
      setRestoreResult({ success: false, message: json.error ?? "Impossible de générer le lien de téléchargement" });
      return;
    }
    const a = document.createElement("a");
    a.href = json.url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function confirmRestore() {
    if (!restoreTarget) return;
    setRestoreLoading(true);
    setRestoreResult(null);
    const res = await fetch("/api/admin/backups/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: restoreTarget.key }),
    });
    const json = await res.json().catch(() => ({}));
    setRestoreLoading(false);
    setRestoreTarget(null);
    if (!res.ok) {
      setRestoreResult({ success: false, message: json.error ?? "Échec de la restauration" });
    } else {
      setRestoreResult({ success: true, message: `Restauration terminée en ${json.durationMs ?? 0} ms.` });
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">Déclencher une sauvegarde</h2>
            <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">Crée un dump SQL compressé et le stocke sur S3.</p>
          </div>
          <Button onClick={triggerBackup} disabled={triggering} className="shrink-0">
            {triggering ? "Sauvegarde…" : "Sauvegarder maintenant"}
          </Button>
        </div>
        {triggerResult && (
          <Alert tone={triggerResult.startsWith("Erreur") ? "danger" : "success"} className="mt-3">
            {triggerResult}
          </Alert>
        )}
        {restoreResult && (
          <Alert tone={restoreResult.success ? "success" : "danger"} className="mt-3">
            {restoreResult.message}
          </Alert>
        )}
      </div>

      {/* ── Liste ────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h2 className="font-display text-[17px] font-semibold leading-6 text-ink">
            Sauvegardes disponibles
            {backups.length > 0 && (
              <span className="ml-2 text-[13px] font-normal text-ink-muted">{backups.length}</span>
            )}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
            {loading ? "Chargement…" : "Actualiser"}
          </Button>
        </div>

        {loading && <SkeletonList rows={3} className="p-5" />}
        {!loading && error && <Alert tone="danger" className="m-5">{error}</Alert>}
        {!loading && !error && backups.length === 0 && (
          <EmptyState size="sm" title="Aucune sauvegarde disponible" />
        )}
        {!loading && !error && backups.length > 0 && (
          <ul className="divide-y divide-line">
            {backups.map((b) => (
              <li key={b.key} className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-ink">{keyToLabel(b.key)}</p>
                  <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">
                    {formatDate(b.lastModified)} · {formatBytes(b.sizeBytes)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => downloadBackup(b)} disabled={downloadingKey === b.key}>
                    {downloadingKey === b.key ? "Préparation…" : "Télécharger"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setRestoreResult(null); setRestoreTarget(b); }}>
                    Restaurer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {restoreTarget && (
        <RestoreModal
          backup={restoreTarget}
          onCancel={() => setRestoreTarget(null)}
          onConfirm={confirmRestore}
          loading={restoreLoading}
        />
      )}
    </div>
  );
}
