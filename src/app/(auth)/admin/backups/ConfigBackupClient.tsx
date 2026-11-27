"use client";

import { useState, useRef } from "react";
import { Alert, Button, FileInput, Modal, RadioGroup, Select, StatusChip } from "@/components/ui";
import type { ImportPreview, ImportResult, MergeStrategy } from "@/lib/config-backup-types";

type ConfigCategory = "structure" | "members" | "links";

/** Ajoute ou retire une catégorie de la sélection (export et import partagent la même logique). */
function toggled(list: ConfigCategory[], cat: ConfigCategory): ConfigCategory[] {
  return list.includes(cat) ? list.filter((c) => c !== cat) : [...list, cat];
}

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
  const [scope, setScope] = useState<string>("all"); // "all" ou l'id d'une église
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
    setCategories((prev) => toggled(prev, cat));
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
      const match = /filename="(.+?)"/.exec(disposition);
      const filename = match?.[1] ?? "koinonia-config.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <RadioGroup
          legend="Périmètre"
          name="scope"
          value={scope === "all" ? "all" : "specific"}
          onChange={(v) => {
            if (v === "all") setScope("all");
            else {
              loadChurches().catch(() => undefined);
              setScope(churches[0]?.id ?? "");
            }
          }}
          options={[
            { value: "all", label: "Toutes les églises" },
            { value: "specific", label: "Une église spécifique" },
          ]}
        />
        {scope !== "all" && (
          <Select
            label="Église à exporter"
            hideLabel
            className="mt-2"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            options={churches.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
      </div>

      <fieldset className="min-w-0">
        <legend className="mb-1 block text-sm font-semibold text-ink">Catégories</legend>
        <div className="flex flex-col">
          {(["structure", "members", "links"] as ConfigCategory[]).map((cat) => (
            <label key={cat} className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink">
              <input
                type="checkbox"
                checked={categories.includes(cat)}
                onChange={() => toggleCategory(cat)}
                className="size-5 accent-brand"
              />
              {CATEGORY_LABELS[cat]}
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <Alert tone="danger">{error}</Alert>
      )}

      <Button
        variant="secondary"
        className="self-start"
        onClick={handleExport}
        disabled={loading || categories.length === 0}
        title={categories.length === 0 ? "Choisissez au moins une catégorie" : undefined}
      >
        {loading ? "Export…" : "Exporter la configuration"}
      </Button>
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
    setCategories((prev) => toggled(prev, cat));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <FileInput
          ref={fileRef}
          accept=".json"
          aria-label="Fichier de configuration (.json)"
          buttonLabel={loading ? "Analyse en cours…" : "Choisir un fichier JSON"}
          fileNames={[]}
          onChange={handleFileChange}
          disabled={loading}
        />
        <p className="text-[13px] leading-[18px] text-ink-muted">Fichier exporté depuis Koinonia (.json)</p>
      </div>

      {error && (
        <Alert tone="danger">{error}</Alert>
      )}

      {importResult && (
        <Alert tone="success" title="Import terminé">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
            <span>Créés : <strong>{importResult.created}</strong></span>
            <span>Mis à jour : <strong>{importResult.updated}</strong></span>
            <span>Ignorés : <strong>{importResult.skipped}</strong></span>
            <span>Erreurs : <strong>{importResult.errors}</strong></span>
          </div>
          {importResult.warnings.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              <p className="text-[13px] font-semibold">Avertissements :</p>
              <ul className="list-disc space-y-0.5 pl-4 text-[13px]">
                {importResult.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </Alert>
      )}

      {/* Preview modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Analyser le fichier d'import">
        {preview && (
          <div className="flex flex-col gap-5">
            <div className="text-[13px] leading-[18px] text-ink-muted">
              Exporté le {new Date(preview.exportedAt).toLocaleString("fr-FR")}
            </div>

            {/* Churches */}
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Églises dans le fichier</p>
              <ul className="flex flex-col gap-1">
                {preview.churches.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-ink">{c.name}</span>
                    <StatusChip tone={c.existsInTarget ? "success" : "warning"}>{c.existsInTarget ? "Existe" : "Nouvelle"}</StatusChip>
                  </li>
                ))}
              </ul>
            </div>

            {/* Counts */}
            <div className="grid grid-cols-3 gap-2 rounded-control border border-line p-3 text-center text-[13px]">
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
              <p className="mb-1 text-sm font-semibold text-ink">Catégories à importer</p>
              <div className="flex flex-col">
                {(["structure", "members", "links"] as ConfigCategory[]).map((cat) => (
                  <label key={cat} className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink">
                    <input
                      type="checkbox"
                      checked={categories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                      className="size-5 accent-brand"
                    />
                    {CATEGORY_LABELS[cat]}
                  </label>
                ))}
              </div>
            </div>

            {/* Strategy */}
            <div>
              <RadioGroup
                legend="Stratégie de fusion"
                name="strategy"
                value={strategy}
                onChange={setStrategy}
                options={STRATEGY_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label, description: opt.desc }))}
              />
              {strategy === "REPLACE" && (
                <Alert tone="warning" className="mt-2">
                  La stratégie REPLACE supprime les entités absentes du fichier. Cette action est irréversible pour les données supprimées.
                </Alert>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setShowModal(false)} disabled={loading}>
                Annuler
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={loading || categories.length === 0}
                title={categories.length === 0 ? "Choisissez au moins une catégorie" : undefined}
              >
                {loading ? "Import…" : "Importer la configuration"}
              </Button>
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
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="border-b border-line px-5 py-4">
          <h3 className="font-display text-[17px] font-semibold leading-6 text-ink">Exporter la configuration</h3>
          <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">
            Génère un fichier JSON contenant la structure organisationnelle (églises, ministères,
            départements), les membres et/ou les liaisons utilisateurs.
          </p>
        </div>
        <div className="p-5">
          <ExportSection />
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="border-b border-line px-5 py-4">
          <h3 className="font-display text-[17px] font-semibold leading-6 text-ink">Importer une configuration</h3>
          <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">
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
