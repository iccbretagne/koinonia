"use client";

import { useState, useRef } from "react";
import Modal from "@/components/ui/Modal";
import type { ImportPreview, ImportResult, MergeStrategy } from "@/lib/config-backup-types";

type ConfigCategory = "structure" | "members" | "links";

const CATEGORY_LABELS: Record<ConfigCategory, string> = {
  structure: "Structure (églises, ministères, départements)",
  members: "Membres",
  links: "Liaisons & rôles utilisateurs",
};

const STRATEGY_OPTIONS: { value: MergeStrategy; label: string; desc: string }[] = [
  {
    value: "SKIP",
    label: "Ignorer les doublons",
    desc: "Les entités déjà présentes (même identifiant) sont laissées intactes. Seules les nouvelles entités sont créées.",
  },
  {
    value: "UPDATE",
    label: "Mettre à jour les doublons",
    desc: "Les entités existantes sont mises à jour avec les valeurs du fichier. Les nouvelles entités sont créées.",
  },
  {
    value: "REPLACE",
    label: "Tout remplacer",
    desc: "Les entités absentes du fichier sont supprimées (si aucune donnée opérationnelle ne les utilise). Les entités présentes sont créées ou mises à jour.",
  },
];

type Church = { id: string; name: string };

// ─── Export section ───────────────────────────────────────────────────────────

function ExportSection() {
  const [churches, setChurches] = useState<Church[]>([]);
  const [churchesLoaded, setChurchesLoaded] = useState(false);
  const [scope, setScope] = useState<"all" | string>("all");
  const [categories, setCategories] = useState<ConfigCategory[]>(["structure", "members", "links"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadChurches() {
    if (churchesLoaded) return;
    const res = await fetch("/api/churches");
    if (res.ok) {
      const data = await res.json();
      setChurches(data);
    }
    setChurchesLoaded(true);
  }

  function toggleCategory(cat: ConfigCategory) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function handleExport() {
    if (categories.length === 0) {
      setError("Sélectionnez au moins une catégorie.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/backups/config/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: scope === "all" ? "all" : [scope],
          categories,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Erreur lors de l'export");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+?)"/);
      const filename = match?.[1] ?? "koinonia-config.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink-muted mb-1">Périmètre</label>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="scope"
              value="all"
              checked={scope === "all"}
              onChange={() => setScope("all")}
              className="text-brand-text focus:ring-focus"
            />
            Toutes les églises
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="scope"
              value="specific"
              checked={scope !== "all"}
              onChange={() => { loadChurches().catch(() => undefined); setScope(churches[0]?.id ?? ""); }}
              className="text-brand-text focus:ring-focus"
            />
            Une église spécifique
          </label>
        </div>
        {scope !== "all" && (
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="mt-2 w-full border border-control-line rounded-lg px-3 py-2 text-sm focus:ring-focus focus:border-brand"
          >
            {churches.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      <div>
        <p className="block text-sm font-medium text-ink-muted mb-2">Catégories</p>
        <div className="space-y-2">
          {(["structure", "members", "links"] as ConfigCategory[]).map((cat) => (
            <label key={cat} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={categories.includes(cat)}
                onChange={() => toggleCategory(cat)}
                className="rounded border-control-line text-brand-text focus:ring-focus"
              />
              {CATEGORY_LABELS[cat]}
            </label>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs bg-danger-soft text-danger px-3 py-2 rounded-lg">{error}</p>
      )}

      <button
        onClick={handleExport}
        disabled={loading || categories.length === 0}
        className="px-4 py-2 text-sm rounded-xl bg-brand text-on-brand font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
      >
        {loading ? "Export en cours…" : "Exporter"}
      </button>
    </div>
  );
}

// ─── Import section ───────────────────────────────────────────────────────────

function ImportSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [fileData, setFileData] = useState<any>(null);
  const [strategy, setStrategy] = useState<MergeStrategy>("SKIP");
  const [categories, setCategories] = useState<ConfigCategory[]>(["structure", "members", "links"]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setPreview(null);
    setImportResult(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setError("Fichier JSON invalide.");
        return;
      }

      const res = await fetch("/api/admin/backups/config/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Erreur lors de l'analyse du fichier");
        return;
      }

      // Pre-select categories present in the file
      const fileCats = (parsed as { _meta?: { categories?: string[] } })?._meta?.categories ?? [];
      const availableCats = (["structure", "members", "links"] as ConfigCategory[]).filter((c) =>
        fileCats.includes(c)
      );
      if (availableCats.length > 0) setCategories(availableCats);

      setFileData(parsed);
      setPreview(json);
      setShowModal(true);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleConfirmImport() {
    if (!fileData || !preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/backups/config/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: fileData, strategy, categories }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Erreur lors de l'import");
        return;
      }
      setImportResult(json);
      setShowModal(false);
    } finally {
      setLoading(false);
    }
  }

  function toggleCategory(cat: ConfigCategory) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="px-4 py-2 text-sm rounded-xl bg-surface border border-brand text-brand-text font-medium hover:bg-brand-soft cursor-pointer transition-colors">
          {loading ? "Analyse en cours…" : "Choisir un fichier JSON"}
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
            disabled={loading}
          />
        </label>
        <p className="text-xs text-ink-muted">Fichier exporté depuis Koinonia (.json)</p>
      </div>

      {error && (
        <p className="text-xs bg-danger-soft text-danger px-3 py-2 rounded-lg">{error}</p>
      )}

      {importResult && (
        <div className="bg-success-soft border border-success/30 rounded-xl p-4 text-sm space-y-2">
          <p className="font-semibold text-success">Import terminé</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-success text-xs">
            <span>Créés : <strong>{importResult.created}</strong></span>
            <span>Mis à jour : <strong>{importResult.updated}</strong></span>
            <span>Ignorés : <strong>{importResult.skipped}</strong></span>
            <span>Erreurs : <strong>{importResult.errors}</strong></span>
          </div>
          {importResult.warnings.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-medium text-warning">Avertissements :</p>
              <ul className="text-xs text-warning list-disc pl-4 space-y-0.5">
                {importResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Preview modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Analyser le fichier d'import">
        {preview && (
          <div className="space-y-5">
            <div className="text-xs text-ink-muted">
              Exporté le {new Date(preview.exportedAt).toLocaleString("fr-FR")}
            </div>

            {/* Churches */}
            <div>
              <p className="text-sm font-medium text-ink-muted mb-2">Églises dans le fichier</p>
              <ul className="space-y-1">
                {preview.churches.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <span className={`inline-block w-2 h-2 rounded-full ${c.existsInTarget ? "bg-success" : "bg-warning"}`} />
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-ink-subtle">{c.existsInTarget ? "existe" : "nouvelle"}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Counts */}
            <div className="bg-surface-sunken rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-xs">
              {[
                ["Ministères", preview.counts.ministries],
                ["Départements", preview.counts.departments],
                ["Membres", preview.counts.members],
                ["Liaisons", preview.counts.userLinks],
                ["Rôles", preview.counts.userRoles],
              ].map(([label, count]) => (
                <div key={label as string}>
                  <p className="font-semibold text-ink text-sm">{count}</p>
                  <p className="text-ink-muted">{label}</p>
                </div>
              ))}
            </div>

            {/* Categories */}
            <div>
              <p className="text-sm font-medium text-ink-muted mb-2">Catégories à importer</p>
              <div className="space-y-1.5">
                {(["structure", "members", "links"] as ConfigCategory[]).map((cat) => (
                  <label key={cat} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={categories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                      className="rounded border-control-line text-brand-text focus:ring-focus"
                    />
                    {CATEGORY_LABELS[cat]}
                  </label>
                ))}
              </div>
            </div>

            {/* Strategy */}
            <div>
              <p className="text-sm font-medium text-ink-muted mb-2">Stratégie de fusion</p>
              <div className="space-y-2">
                {STRATEGY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                      strategy === opt.value
                        ? "border-brand bg-brand-soft"
                        : "border-line hover:border-control-line"
                    }`}
                  >
                    <input
                      type="radio"
                      name="strategy"
                      value={opt.value}
                      checked={strategy === opt.value}
                      onChange={() => setStrategy(opt.value)}
                      className="mt-0.5 text-brand-text focus:ring-focus shrink-0"
                    />
                    <div>
                      <p className="text-sm font-medium text-ink">{opt.label}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              {strategy === "REPLACE" && (
                <p className="text-xs text-warning bg-warning-soft border border-warning/30 rounded-lg px-3 py-2 mt-2">
                  ⚠️ La stratégie REPLACE supprime les entités absentes du fichier. Cette action est irréversible pour les données supprimées.
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-lg border border-line text-ink-muted hover:bg-surface-sunken transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={loading || categories.length === 0}
                className="px-4 py-2 text-sm rounded-xl bg-brand text-on-brand font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                {loading ? "Import en cours…" : "Confirmer l'import"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ConfigBackupClient() {
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-surface rounded-2xl border border-line shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">Exporter la configuration</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Génère un fichier JSON contenant la structure organisationnelle (églises, ministères,
            départements), les membres et/ou les liaisons utilisateurs.
          </p>
        </div>
        <div className="p-5">
          <ExportSection />
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-line shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">Importer une configuration</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Restaure partiellement la configuration depuis un fichier JSON exporté.
            Un résumé est affiché avant toute modification.
          </p>
        </div>
        <div className="p-5">
          <ImportSection />
        </div>
      </div>
    </div>
  );
}
