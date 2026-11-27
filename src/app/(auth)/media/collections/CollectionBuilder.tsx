"use client";

import { useState, useMemo } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Alert, Button, Checkbox, FilterChip, Input, Select, StatusChip, buttonClasses } from "@/components/ui";

type EventItem = {
  id: string;
  name: string;
  date: string;
  approvedPhotoCount: number;
  totalPhotoCount: number;
};

type ProjectItem = {
  id: string;
  name: string;
  createdAt: string;
  approvedFileCount: number;
};

type Scope = "photos" | "files" | "both";

const SCOPE_LABEL: Record<Scope, string> = {
  both: "Photos et visuels",
  photos: "Photos uniquement",
  files: "Visuels uniquement",
};

function selectionSummary(selected: number, total: number, noun: string): string {
  if (selected <= 0) return "Tout sélectionner";
  const selectedPlural = selected > 1 ? "s" : "";
  const totalPlural = total === 1 ? "" : "s";
  return `${selected} sélectionné${selectedPlural} · ${total} ${noun}${totalPlural}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function CollectionBuilder({
  churchId,
  events,
  projects,
  initialEventIds,
  initialProjectIds,
  lockedScope,
  selection,
  onCreated,
}: {
  readonly churchId: string;
  readonly events: EventItem[];
  readonly projects: ProjectItem[];
  /** Présélection (spec 049) : depuis « Partager une sélection » sur Photos/Visuels. */
  readonly initialEventIds?: string[];
  readonly initialProjectIds?: string[];
  /** Verrouille le contenu à un seul type — masque le sélecteur (partage depuis une seule activité). */
  readonly lockedScope?: Scope;
  /**
   * Sélection fine depuis la galerie (spec 080) : médias choisis un à un. Les listes
   * d'événements et de projets sont alors masquées ; le lien ne couvre que ces médias.
   */
  readonly selection?: { photoIds: string[]; fileIds: string[]; eventIds: string[]; projectIds: string[] };
  readonly onCreated?: (result: { url: string; label: string | null }) => void;
}) {
  const [scope, setScope]           = useState<Scope>(lockedScope ?? "both");
  const [includeAllPhotos, setIncludeAllPhotos] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set(initialEventIds));
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set(initialProjectIds));
  const [label, setLabel]           = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | "">(30);
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [creating, setCreating]     = useState(false);
  const [result, setResult]         = useState<{ url: string; label: string | null } | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);

  // Filter events by date range
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (dateFrom && e.date < dateFrom) return false;
      if (dateTo   && e.date > dateTo + "T23:59:59") return false;
      return true;
    });
  }, [events, dateFrom, dateTo]);

  function toggleEvent(id: string) {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleProject(id: string) {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllEvents() {
    if (selectedEvents.size === filteredEvents.length) {
      setSelectedEvents(new Set());
    } else {
      setSelectedEvents(new Set(filteredEvents.map((e) => e.id)));
    }
  }

  function selectAllProjects() {
    if (selectedProjects.size === projects.length) {
      setSelectedProjects(new Set());
    } else {
      setSelectedProjects(new Set(projects.map((p) => p.id)));
    }
  }

  const showEvents   = scope === "photos" || scope === "both";
  const showProjects = scope === "files"  || scope === "both";

  const totalPhotos = filteredEvents
    .filter((e) => selectedEvents.has(e.id))
    .reduce((n, e) => n + (includeAllPhotos ? e.totalPhotoCount : e.approvedPhotoCount), 0);
  const totalFiles = projects
    .filter((p) => selectedProjects.has(p.id))
    .reduce((n, p) => n + p.approvedFileCount, 0);

  const canCreate =
    !creating &&
    label.trim().length > 0 &&
    (selection
      ? selection.photoIds.length + selection.fileIds.length > 0
      : (showEvents && selectedEvents.size > 0) || (showProjects && selectedProjects.size > 0));

  function selectionScope(sel: NonNullable<typeof selection>): Scope {
    if (sel.photoIds.length > 0 && sel.fileIds.length > 0) return "both";
    return sel.photoIds.length > 0 ? "photos" : "files";
  }

  async function createCollection() {
    setCreating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/media/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          selection
            ? {
                churchId,
                label: label.trim(),
                scope: selectionScope(selection),
                eventIds: selection.eventIds,
                projectIds: selection.projectIds,
                photoIds: selection.photoIds,
                fileIds: selection.fileIds,
                expiresInDays: expiresInDays !== "" ? expiresInDays : undefined,
              }
            : {
                churchId,
                label: label.trim(),
                scope,
                eventIds:   showEvents   ? Array.from(selectedEvents)   : [],
                projectIds: showProjects ? Array.from(selectedProjects) : [],
                expiresInDays: expiresInDays !== "" ? expiresInDays : undefined,
                includeAllPhotos: showEvents ? includeAllPhotos : undefined,
              }
        ),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Erreur lors de la création");
      } else {
        const created = { url: json.url, label: json.label ?? null };
        setResult(created);
        onCreated?.(created);
      }
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {selection && (
        <div>
          <h2 className="font-display text-[15px] font-semibold text-ink">Contenu du lien</h2>
          <p className="text-sm text-ink-muted mt-1">
            {selection.photoIds.length + selection.fileIds.length} média{selection.photoIds.length + selection.fileIds.length > 1 ? "s" : ""} sélectionné{selection.photoIds.length + selection.fileIds.length > 1 ? "s" : ""} dans la galerie : seuls ces médias seront visibles par le lien.
          </p>
        </div>
      )}
      {!selection && (<>
      {/* ── Scope ─────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="font-display text-[15px] font-semibold text-ink">Contenu à inclure</h2>
        {!lockedScope && (
          <div className="flex gap-2 flex-wrap">
            {(["both", "photos", "files"] as Scope[]).map((s) => (
              <FilterChip key={s} pressed={scope === s} onClick={() => setScope(s)}>
                {SCOPE_LABEL[s]}
              </FilterChip>
            ))}
          </div>
        )}

        {showEvents && (
          <div className="pt-2 border-t border-line space-y-2">
            <p className="text-sm font-semibold text-ink">Périmètre des photos</p>
            <div className="flex gap-2 flex-wrap">
              {([false, true] as const).map((allPhotos) => (
                <FilterChip key={String(allPhotos)} pressed={includeAllPhotos === allPhotos} onClick={() => setIncludeAllPhotos(allPhotos)}>
                  {allPhotos ? "Toutes les photos" : "Photos validées uniquement"}
                </FilterChip>
              ))}
            </div>
            {includeAllPhotos && (
              <Alert tone="warning">
                Ce lien diffusera aussi les photos en attente ou non validées, sans distinction de statut.
              </Alert>
            )}
          </div>
        )}
      </div>

      {/* ── Events filter + selection ──────────────────────────────────────── */}
      {showEvents && (
        <div className="bg-surface rounded-card border border-line shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <h2 className="font-display text-[15px] font-semibold text-ink mb-3">Événements — photos validées</h2>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-40">
                <Input label="Du" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="w-40">
                <Input label="Au" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              {(dateFrom || dateTo) && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                  Effacer les dates
                </Button>
              )}
            </div>
          </div>

          {filteredEvents.length === 0 ? (
            <p className="p-5 text-sm text-ink-subtle">Aucun événement{dateFrom || dateTo ? " sur cette période" : ""}.</p>
          ) : (
            <>
              <label className="px-5 min-h-11 border-b border-line flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={selectedEvents.size === filteredEvents.length && filteredEvents.length > 0}
                  onChange={selectAllEvents}
                />
                <span className="text-sm text-ink-muted">
                  {selectionSummary(selectedEvents.size, totalPhotos, "photo")}
                </span>
              </label>
              <ul className="max-h-64 overflow-y-auto divide-y divide-line">
                {filteredEvents.map((e) => (
                  <li
                    key={e.id}
                    className={`hover:bg-surface-sunken transition-colors ${selectedEvents.has(e.id) ? "bg-brand-soft" : ""}`}
                  >
                    <label className="flex items-center gap-3 px-5 py-3 cursor-pointer">
                      <Checkbox checked={selectedEvents.has(e.id)} onChange={() => toggleEvent(e.id)} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink truncate">{e.name}</p>
                        <p className="text-xs text-ink-subtle">{formatDate(e.date)}</p>
                      </div>
                      <StatusChip tone={e.approvedPhotoCount > 0 ? "success" : "neutral"} className="shrink-0">
                        {e.approvedPhotoCount} validée{e.approvedPhotoCount > 1 ? "s" : ""} / {e.totalPhotoCount} au total
                      </StatusChip>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ── Projects selection ─────────────────────────────────────────────── */}
      {showProjects && (
        <div className="bg-surface rounded-card border border-line shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <h2 className="font-display text-[15px] font-semibold text-ink">Projets — visuels approuvés</h2>
          </div>
          {projects.length === 0 ? (
            <p className="p-5 text-sm text-ink-subtle">Aucun projet disponible.</p>
          ) : (
            <>
              <label className="px-5 min-h-11 border-b border-line flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={selectedProjects.size === projects.length && projects.length > 0}
                  onChange={selectAllProjects}
                />
                <span className="text-sm text-ink-muted">
                  {selectionSummary(selectedProjects.size, totalFiles, "visuel")}
                </span>
              </label>
              <ul className="max-h-64 overflow-y-auto divide-y divide-line">
                {projects.map((p) => (
                  <li
                    key={p.id}
                    className={`hover:bg-surface-sunken transition-colors ${selectedProjects.has(p.id) ? "bg-brand-soft" : ""}`}
                  >
                    <label className="flex items-center gap-3 px-5 py-3 cursor-pointer">
                      <Checkbox checked={selectedProjects.has(p.id)} onChange={() => toggleProject(p.id)} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink truncate">{p.name}</p>
                        <p className="text-xs text-ink-subtle">{formatDate(p.createdAt)}</p>
                      </div>
                      <StatusChip tone={p.approvedFileCount > 0 ? "success" : "neutral"} className="shrink-0">
                        {p.approvedFileCount} approuvé{p.approvedFileCount > 1 ? "s" : ""}
                      </StatusChip>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      </>)}

      {/* ── Options ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="font-display text-[15px] font-semibold text-ink">Options du lien</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Nom du lien"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex : Mariage Dupont - Jan 2026"
          />
          <Select
            label="Expiration"
            value={String(expiresInDays)}
            onChange={(e) => setExpiresInDays(e.target.value === "" ? "" : Number(e.target.value))}
            options={[
              { value: "7", label: "7 jours" },
              { value: "30", label: "30 jours" },
              { value: "90", label: "90 jours" },
              { value: "365", label: "1 an" },
              { value: "", label: "Pas d'expiration" },
            ]}
          />
        </div>

        <Button type="button" className="w-full" onClick={createCollection} disabled={!canCreate}>
          {creating ? "Génération en cours…" : "Générer le lien de collection"}
        </Button>
        {!canCreate && !creating && (
          <p className="text-[13px] text-ink-muted">Nommez le lien et choisissez au moins un élément à partager.</p>
        )}

        {error && <Alert tone="danger">{error}</Alert>}
      </div>

      {/* ── Result ─────────────────────────────────────────────────────────── */}
      {result && (
        <div className="bg-success-soft border border-success/30 rounded-card p-5 space-y-3">
          <p className="text-sm font-semibold text-ink">
            Lien créé {result.label ? `"${result.label}"` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 basis-56">
              <Input
                readOnly
                aria-label="Adresse du lien"
                value={result.url}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
            </div>
            <Button type="button" variant="secondary" onClick={copyLink}>
              <Copy aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {copied ? "Copié !" : "Copier le lien"}
            </Button>
          </div>
          <a href={result.url} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary")}>
            <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Ouvrir la collection
          </a>
        </div>
      )}
    </div>
  );
}
