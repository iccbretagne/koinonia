"use client";

import { useState, useEffect } from "react";

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
  const match = key.match(/backups\/(.+?)\/db\.sql\.gz$/);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-scrim backdrop-blur-sm" aria-hidden="true" onClick={onCancel} />
      <div className="relative bg-surface rounded-2xl shadow-overlay w-full max-w-md p-6 space-y-4">
        {step === 1 ? (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger-soft flex items-center justify-center text-danger text-xl shrink-0">
                ⚠️
              </div>
              <h2 className="text-lg font-bold text-ink">Restaurer une sauvegarde</h2>
            </div>
            <div className="bg-danger-soft border border-danger/30 rounded-xl p-4 space-y-2 text-sm text-danger">
              <p className="font-semibold">Cette action est irréversible.</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Toutes les données actuelles seront <strong>écrasées</strong> par cette sauvegarde.</li>
                <li>Les modifications effectuées depuis la date de sauvegarde seront <strong>perdues définitivement</strong>.</li>
                <li>L&apos;application sera indisponible pendant la restauration.</li>
              </ul>
            </div>
            <div className="text-sm text-ink-muted">
              <span className="font-medium">Sauvegarde sélectionnée :</span>
              <br />
              <span className="text-ink-muted text-xs">{keyToLabel(backup.key)}</span>
              <span className="ml-2 text-ink-subtle text-xs">({formatBytes(backup.sizeBytes)})</span>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm rounded-lg border border-line text-ink-muted hover:bg-surface-sunken transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 text-sm rounded-lg bg-danger text-on-danger font-medium hover:bg-danger/90 transition-colors"
              >
                Je comprends, continuer →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger-soft flex items-center justify-center text-danger text-xl shrink-0">
                🔴
              </div>
              <h2 className="text-lg font-bold text-ink">Confirmation finale</h2>
            </div>
            <p className="text-sm text-ink-muted">
              Confirmez-vous la restauration de la base de données vers la sauvegarde du{" "}
              <strong>{formatDate(backup.lastModified)}</strong> ?
            </p>
            <p className="text-xs text-danger font-medium">
              Toutes les données actuelles seront définitivement perdues.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={onCancel}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-lg border border-line text-ink-muted hover:bg-surface-sunken transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-lg bg-danger text-on-danger font-medium hover:bg-danger/90 disabled:opacity-50 transition-colors"
              >
                {loading ? "Restauration en cours…" : "Restaurer maintenant"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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
    fetch("/api/admin/backups")
      .then(async (res) => {
        if (!mounted) return;
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          if (mounted) setError(json.error ?? "Impossible de charger les sauvegardes");
        } else {
          const data = await res.json();
          if (mounted) setBackups(data);
        }
      })
      .catch(() => { if (mounted) setError("Impossible de charger les sauvegardes"); })
      .finally(() => { if (mounted) setLoading(false); });
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
    document.body.removeChild(a);
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
    <div className="space-y-5 max-w-3xl">
      {/* ── Actions ─────────────────────────────────────────────── */}
      <div className="bg-surface rounded-2xl border border-line shadow-card p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-ink">Déclencher une sauvegarde</h2>
            <p className="text-xs text-ink-muted mt-0.5">Crée un dump SQL compressé et le stocke sur S3.</p>
          </div>
          <button
            onClick={triggerBackup}
            disabled={triggering}
            className="px-4 py-2 text-sm rounded-xl bg-brand text-on-brand font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors shrink-0"
          >
            {triggering ? "Sauvegarde en cours…" : "Sauvegarder maintenant"}
          </button>
        </div>
        {triggerResult && (
          <p className={`text-xs mt-3 px-3 py-2 rounded-lg ${triggerResult.startsWith("Erreur") ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
            {triggerResult}
          </p>
        )}
        {restoreResult && (
          <p className={`text-xs mt-3 px-3 py-2 rounded-lg ${restoreResult.success ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
            {restoreResult.message}
          </p>
        )}
      </div>

      {/* ── Liste ────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-2xl border border-line shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">
            Sauvegardes disponibles
            {backups.length > 0 && (
              <span className="ml-2 text-xs font-normal text-ink-subtle">{backups.length}</span>
            )}
          </h2>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="text-xs text-ink-subtle hover:text-brand-text transition-colors disabled:opacity-50"
          >
            Actualiser
          </button>
        </div>

        {loading && <div className="p-8 text-center text-sm text-ink-subtle">Chargement…</div>}
        {!loading && error && <div className="p-8 text-center text-sm text-danger">{error}</div>}
        {!loading && !error && backups.length === 0 && (
          <div className="p-8 text-center text-sm text-ink-subtle">Aucune sauvegarde disponible.</div>
        )}
        {!loading && !error && backups.length > 0 && (
          <ul className="divide-y divide-line">
            {backups.map((b) => (
              <li key={b.key} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-surface-sunken transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{keyToLabel(b.key)}</p>
                  <p className="text-xs text-ink-subtle mt-0.5">
                    {formatDate(b.lastModified)} · {formatBytes(b.sizeBytes)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => downloadBackup(b)}
                    disabled={downloadingKey === b.key}
                    className="text-xs text-brand-text hover:text-brand-text border border-brand/20 hover:border-brand/40 rounded-lg px-3 py-1.5 hover:bg-brand-soft disabled:opacity-50 transition-colors"
                  >
                    {downloadingKey === b.key ? "…" : "Télécharger"}
                  </button>
                  <button
                    onClick={() => { setRestoreResult(null); setRestoreTarget(b); }}
                    className="text-xs text-danger hover:text-danger border border-danger/30 hover:border-danger/30 rounded-lg px-3 py-1.5 hover:bg-danger-soft transition-colors"
                  >
                    Restaurer
                  </button>
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
