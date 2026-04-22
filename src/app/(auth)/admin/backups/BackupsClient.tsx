"use client";

import { useState, useEffect, useCallback } from "react";

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
  backup: BackupEntry;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const [step, setStep] = useState<1 | 2>(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        {step === 1 ? (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xl shrink-0">
                ⚠️
              </div>
              <h2 className="text-lg font-bold text-gray-900">Restaurer une sauvegarde</h2>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2 text-sm text-red-800">
              <p className="font-semibold">Cette action est irréversible.</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Toutes les données actuelles seront <strong>écrasées</strong> par cette sauvegarde.</li>
                <li>Les modifications effectuées depuis la date de sauvegarde seront <strong>perdues définitivement</strong>.</li>
                <li>L&apos;application sera indisponible pendant la restauration.</li>
              </ul>
            </div>
            <div className="text-sm text-gray-700">
              <span className="font-medium">Sauvegarde sélectionnée :</span>
              <br />
              <span className="text-gray-500 text-xs">{keyToLabel(backup.key)}</span>
              <span className="ml-2 text-gray-400 text-xs">({formatBytes(backup.sizeBytes)})</span>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
              >
                Je comprends, continuer →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xl shrink-0">
                🔴
              </div>
              <h2 className="text-lg font-bold text-gray-900">Confirmation finale</h2>
            </div>
            <p className="text-sm text-gray-700">
              Confirmez-vous la restauration de la base de données vers la sauvegarde du{" "}
              <strong>{formatDate(backup.lastModified)}</strong> ?
            </p>
            <p className="text-xs text-red-600 font-medium">
              Toutes les données actuelles seront définitivement perdues.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={onCancel}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
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

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/backups");
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Impossible de charger les sauvegardes");
    } else {
      setBackups(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  async function triggerBackup() {
    setTriggering(true);
    setTriggerResult(null);
    const res = await fetch("/api/admin/backups", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTriggerResult(`Erreur : ${json.error ?? "échec de la sauvegarde"}`);
    } else {
      setTriggerResult(`Sauvegarde créée : ${keyToLabel(json.key)} (${formatBytes(json.sizeBytes)})`);
      fetchBackups();
    }
    setTriggering(false);
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
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Déclencher une sauvegarde</h2>
            <p className="text-xs text-gray-500 mt-0.5">Crée un dump SQL compressé et le stocke sur S3.</p>
          </div>
          <button
            onClick={triggerBackup}
            disabled={triggering}
            className="px-4 py-2 text-sm rounded-xl bg-icc-violet text-white font-medium hover:bg-icc-violet/90 disabled:opacity-50 transition-colors shrink-0"
          >
            {triggering ? "Sauvegarde en cours…" : "Sauvegarder maintenant"}
          </button>
        </div>
        {triggerResult && (
          <p className={`text-xs mt-3 px-3 py-2 rounded-lg ${triggerResult.startsWith("Erreur") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
            {triggerResult}
          </p>
        )}
        {restoreResult && (
          <p className={`text-xs mt-3 px-3 py-2 rounded-lg ${restoreResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {restoreResult.message}
          </p>
        )}
      </div>

      {/* ── Liste ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            Sauvegardes disponibles
            {backups.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">{backups.length}</span>
            )}
          </h2>
          <button
            onClick={fetchBackups}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-icc-violet transition-colors disabled:opacity-50"
          >
            Actualiser
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Chargement…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-500">{error}</div>
        ) : backups.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">Aucune sauvegarde disponible.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {backups.map((b) => (
              <li key={b.key} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{keyToLabel(b.key)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(b.lastModified)} · {formatBytes(b.sizeBytes)}
                  </p>
                </div>
                <button
                  onClick={() => { setRestoreResult(null); setRestoreTarget(b); }}
                  className="text-xs text-red-500 hover:text-red-700 border border-red-100 hover:border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors shrink-0"
                >
                  Restaurer
                </button>
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
