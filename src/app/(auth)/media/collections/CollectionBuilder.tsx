"use client";

import { useState, useMemo } from "react";

type EventItem = {
  id: string;
  name: string;
  date: string;
  approvedPhotoCount: number;
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
}: {
  churchId: string;
  events: EventItem[];
  projects: ProjectItem[];
}) {
  const [scope, setScope]           = useState<Scope>("both");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
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
    .reduce((n, e) => n + e.approvedPhotoCount, 0);
  const totalFiles = projects
    .filter((p) => selectedProjects.has(p.id))
    .reduce((n, p) => n + p.approvedFileCount, 0);

  const canCreate =
    !creating &&
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
          label: label.trim() || undefined,
          scope,
          eventIds:   showEvents   ? Array.from(selectedEvents)   : [],
          projectIds: showProjects ? Array.from(selectedProjects) : [],
          expiresInDays: expiresInDays !== "" ? expiresInDays : undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Erreur lors de la création");
      } else {
        setResult({ url: json.url, label: json.label ?? null });
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
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Contenu à inclure</h2>
        <div className="flex gap-2 flex-wrap">
          {(["both", "photos", "files"] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                scope === s
                  ? "bg-icc-violet text-white border-icc-violet"
                  : "bg-white text-gray-600 border-gray-200 hover:border-icc-violet/40 hover:bg-icc-violet/5"
              }`}
            >
              {s === "both" ? "Photos + Visuels" : s === "photos" ? "Photos uniquement" : "Visuels uniquement"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Events filter + selection ──────────────────────────────────────── */}
      {showEvents && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Événements — photos validées</h2>
            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-icc-violet"
                placeholder="Du"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-icc-violet"
                placeholder="Au"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2"
                >
                  Effacer
                </button>
              )}
            </div>
          </div>

          {filteredEvents.length === 0 ? (
            <p className="p-5 text-sm text-gray-400">Aucun événement{dateFrom || dateTo ? " sur cette période" : ""}.</p>
          ) : (
            <>
              <div className="px-5 py-2 border-b border-gray-50 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedEvents.size === filteredEvents.length && filteredEvents.length > 0}
                  onChange={selectAllEvents}
                  className="w-4 h-4 rounded border-gray-300 accent-icc-violet"
                />
                <span className="text-xs text-gray-500">
                  {selectedEvents.size > 0
                    ? `${selectedEvents.size} sélectionné${selectedEvents.size > 1 ? "s" : ""} · ${totalPhotos} photo${totalPhotos !== 1 ? "s" : ""}`
                    : "Tout sélectionner"}
                </span>
              </div>
              <ul className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                {filteredEvents.map((e) => (
                  <li
                    key={e.id}
                    onClick={() => toggleEvent(e.id)}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${selectedEvents.has(e.id) ? "bg-icc-violet/5" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedEvents.has(e.id)}
                      onChange={() => toggleEvent(e.id)}
                      onClick={(ev) => ev.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 accent-icc-violet shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{e.name}</p>
                      <p className="text-xs text-gray-400">{formatDate(e.date)}</p>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 shrink-0 ${e.approvedPhotoCount > 0 ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                      {e.approvedPhotoCount} validée{e.approvedPhotoCount !== 1 ? "s" : ""}
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
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Projets — visuels approuvés</h2>
          </div>
          {projects.length === 0 ? (
            <p className="p-5 text-sm text-gray-400">Aucun projet disponible.</p>
          ) : (
            <>
              <div className="px-5 py-2 border-b border-gray-50 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedProjects.size === projects.length && projects.length > 0}
                  onChange={selectAllProjects}
                  className="w-4 h-4 rounded border-gray-300 accent-icc-violet"
                />
                <span className="text-xs text-gray-500">
                  {selectedProjects.size > 0
                    ? `${selectedProjects.size} sélectionné${selectedProjects.size > 1 ? "s" : ""} · ${totalFiles} visuel${totalFiles !== 1 ? "s" : ""}`
                    : "Tout sélectionner"}
                </span>
              </div>
              <ul className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                {projects.map((p) => (
                  <li
                    key={p.id}
                    onClick={() => toggleProject(p.id)}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${selectedProjects.has(p.id) ? "bg-icc-violet/5" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjects.has(p.id)}
                      onChange={() => toggleProject(p.id)}
                      onClick={(ev) => ev.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 accent-icc-violet shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">{formatDate(p.createdAt)}</p>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 shrink-0 ${p.approvedFileCount > 0 ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"}`}>
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
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Options du lien</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nom du lien (optionnel)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex : Mariage Dupont - Jan 2026"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/30 focus:border-icc-violet"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Expiration</label>
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-icc-violet/30 focus:border-icc-violet"
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
          className="w-full py-2.5 rounded-xl bg-icc-violet text-white text-sm font-medium hover:bg-icc-violet/90 disabled:opacity-40 transition-colors"
        >
          {creating ? "Génération…" : "Générer le lien de collection"}
        </button>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}
      </div>

      {/* ── Result ─────────────────────────────────────────────────────────── */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-semibold text-green-800">
            Lien créé {result.label ? `"${result.label}"` : ""}
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={result.url}
              className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-2 text-gray-700 truncate focus:outline-none"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={copyLink}
              className="shrink-0 text-xs bg-green-700 text-white rounded-lg px-3 py-2 hover:bg-green-800 transition-colors font-medium"
            >
              {copied ? "Copié !" : "Copier"}
            </button>
          </div>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-green-700 underline hover:text-green-900"
          >
            Ouvrir la collection →
          </a>
        </div>
      )}
    </div>
  );
}
