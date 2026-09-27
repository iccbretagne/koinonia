"use client";

import { useState, useMemo } from "react";

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
    ((showEvents   && selectedEvents.size > 0)   ||
     (showProjects && selectedProjects.size > 0));

  async function createCollection() {
    setCreating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/media/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchId,
          label: label.trim(),
          scope,
          eventIds:   showEvents   ? Array.from(selectedEvents)   : [],
          projectIds: showProjects ? Array.from(selectedProjects) : [],
          expiresInDays: expiresInDays !== "" ? expiresInDays : undefined,
          includeAllPhotos: showEvents ? includeAllPhotos : undefined,
        }),
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
      {/* ── Scope ─────────────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-2xl border border-line shadow-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink">Contenu à inclure</h2>
        {!lockedScope && (
          <div className="flex gap-2 flex-wrap">
            {(["both", "photos", "files"] as Scope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  scope === s
                    ? "bg-brand text-on-brand border-brand"
                    : "bg-surface text-ink-muted border-line hover:border-brand/40 hover:bg-brand-soft"
                }`}
              >
                {s === "both" ? "Photos + Visuels" : s === "photos" ? "Photos uniquement" : "Visuels uniquement"}
              </button>
            ))}
          </div>
        )}

        {showEvents && (
          <div className="pt-2 border-t border-line space-y-2">
            <p className="text-xs font-medium text-ink-muted">Périmètre des photos</p>
            <div className="flex gap-2 flex-wrap">
              {([false, true] as const).map((allPhotos) => (
                <button
                  key={String(allPhotos)}
                  onClick={() => setIncludeAllPhotos(allPhotos)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    includeAllPhotos === allPhotos
                      ? "bg-brand text-on-brand border-brand"
                      : "bg-surface text-ink-muted border-line hover:border-brand/40 hover:bg-brand-soft"
                  }`}
                >
                  {allPhotos ? "Toutes les photos" : "Photos validées uniquement"}
                </button>
              ))}
            </div>
            {includeAllPhotos && (
              <p className="text-xs text-warning bg-warning-soft border border-warning/30 rounded-lg px-3 py-2">
                Attention : ce lien diffusera aussi les photos en attente ou non validées, sans distinction de statut.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Events filter + selection ──────────────────────────────────────── */}
      {showEvents && (
        <div className="bg-surface rounded-2xl border border-line shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <h2 className="text-sm font-semibold text-ink mb-3">Événements — photos validées</h2>
            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-xs border border-line rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-focus"
                placeholder="Du"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-xs border border-line rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-focus"
                placeholder="Au"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="text-xs text-ink-subtle hover:text-ink-muted px-2"
                >
                  Effacer
                </button>
              )}
            </div>
          </div>

          {filteredEvents.length === 0 ? (
            <p className="p-5 text-sm text-ink-subtle">Aucun événement{dateFrom || dateTo ? " sur cette période" : ""}.</p>
          ) : (
            <>
              <div className="px-5 py-2 border-b border-line flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedEvents.size === filteredEvents.length && filteredEvents.length > 0}
                  onChange={selectAllEvents}
                  className="w-4 h-4 rounded border-control-line accent-brand"
                />
                <span className="text-xs text-ink-muted">
                  {selectedEvents.size > 0
                    ? `${selectedEvents.size} sélectionné${selectedEvents.size > 1 ? "s" : ""} · ${totalPhotos} photo${totalPhotos !== 1 ? "s" : ""}`
                    : "Tout sélectionner"}
                </span>
              </div>
              <ul className="max-h-64 overflow-y-auto divide-y divide-line">
                {filteredEvents.map((e) => (
                  <li
                    key={e.id}
                    onClick={() => toggleEvent(e.id)}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-surface-sunken transition-colors ${selectedEvents.has(e.id) ? "bg-brand-soft" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedEvents.has(e.id)}
                      onChange={() => toggleEvent(e.id)}
                      onClick={(ev) => ev.stopPropagation()}
                      className="w-4 h-4 rounded border-control-line accent-brand shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">{e.name}</p>
                      <p className="text-xs text-ink-subtle">{formatDate(e.date)}</p>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 shrink-0 ${e.approvedPhotoCount > 0 ? "bg-success-soft text-success" : "bg-surface-sunken text-ink-subtle"}`}>
                      {e.approvedPhotoCount} validée{e.approvedPhotoCount !== 1 ? "s" : ""} / {e.totalPhotoCount} au total
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ── Projects selection ─────────────────────────────────────────────── */}
      {showProjects && (
        <div className="bg-surface rounded-2xl border border-line shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <h2 className="text-sm font-semibold text-ink">Projets — visuels approuvés</h2>
          </div>
          {projects.length === 0 ? (
            <p className="p-5 text-sm text-ink-subtle">Aucun projet disponible.</p>
          ) : (
            <>
              <div className="px-5 py-2 border-b border-line flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedProjects.size === projects.length && projects.length > 0}
                  onChange={selectAllProjects}
                  className="w-4 h-4 rounded border-control-line accent-brand"
                />
                <span className="text-xs text-ink-muted">
                  {selectedProjects.size > 0
                    ? `${selectedProjects.size} sélectionné${selectedProjects.size > 1 ? "s" : ""} · ${totalFiles} visuel${totalFiles !== 1 ? "s" : ""}`
                    : "Tout sélectionner"}
                </span>
              </div>
              <ul className="max-h-64 overflow-y-auto divide-y divide-line">
                {projects.map((p) => (
                  <li
                    key={p.id}
                    onClick={() => toggleProject(p.id)}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-surface-sunken transition-colors ${selectedProjects.has(p.id) ? "bg-brand-soft" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjects.has(p.id)}
                      onChange={() => toggleProject(p.id)}
                      onClick={(ev) => ev.stopPropagation()}
                      className="w-4 h-4 rounded border-control-line accent-brand shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">{p.name}</p>
                      <p className="text-xs text-ink-subtle">{formatDate(p.createdAt)}</p>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 shrink-0 ${p.approvedFileCount > 0 ? "bg-success-soft text-success" : "bg-surface-sunken text-ink-subtle"}`}>
                      {p.approvedFileCount} approuvé{p.approvedFileCount !== 1 ? "s" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ── Options ────────────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-2xl border border-line shadow-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Options du lien</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Nom du lien</label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex : Mariage Dupont - Jan 2026"
              className="w-full border border-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/30 focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Expiration</label>
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full border border-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus/30 focus:border-brand"
            >
              <option value={7}>7 jours</option>
              <option value={30}>30 jours</option>
              <option value={90}>90 jours</option>
              <option value={365}>1 an</option>
              <option value="">Pas d&apos;expiration</option>
            </select>
          </div>
        </div>

        <button
          onClick={createCollection}
          disabled={!canCreate}
          className="w-full py-2.5 rounded-xl bg-brand text-on-brand text-sm font-medium hover:bg-brand-hover disabled:opacity-40 transition-colors"
        >
          {creating ? "Génération…" : "Générer le lien de collection"}
        </button>

        {error && (
          <p className="text-xs text-danger bg-danger-soft px-3 py-2 rounded-lg">{error}</p>
        )}
      </div>

      {/* ── Result ─────────────────────────────────────────────────────────── */}
      {result && (
        <div className="bg-success-soft border border-success/30 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-semibold text-success">
            Lien créé {result.label ? `"${result.label}"` : ""}
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={result.url}
              className="flex-1 text-xs bg-surface border border-success/30 rounded-lg px-3 py-2 text-ink-muted truncate focus:outline-none"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={copyLink}
              className="shrink-0 text-xs border border-success/40 text-success rounded-lg px-3 py-2 hover:bg-success/10 transition-colors font-medium"
            >
              {copied ? "Copié !" : "Copier"}
            </button>
          </div>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-success underline hover:text-success"
          >
            Ouvrir la collection →
          </a>
        </div>
      )}
    </div>
  );
}
