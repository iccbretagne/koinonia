"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Assignment {
  id: string;
  welcomeDutyFamily: { id: string; familyName: string };
  note: string | null;
}

interface Suggestion {
  id: string;
  familyName: string;
  lastServedAt: string | null;
}

interface Props {
  eventId: string;
}

export default function WelcomeDutyWidget({ eventId }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, sRes] = await Promise.all([
        fetch(`/api/welcome-duty/assignments?eventId=${eventId}`),
        fetch(`/api/welcome-duty/suggestions?eventId=${eventId}&limit=5`),
      ]);
      const aData = await aRes.json();
      const sData = await sRes.json();
      setAssignments(Array.isArray(aData) ? aData : []);
      setSuggestions(Array.isArray(sData) ? sData : []);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function assign(familyId: string) {
    setAssigning(familyId);
    try {
      const res = await fetch("/api/welcome-duty/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, welcomeDutyFamilyId: familyId }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      await fetchData();
    } finally {
      setAssigning(null);
    }
  }

  async function remove(assignmentId: string) {
    setRemoving(assignmentId);
    try {
      const res = await fetch(`/api/welcome-duty/assignments/${assignmentId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Erreur"); return; }
      await fetchData();
    } finally {
      setRemoving(null);
    }
  }

  function formatLastServed(date: string | null) {
    if (!date) return "Jamais servi";
    return `Dernier service : ${new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`;
  }

  return (
    <div className="mb-6 p-4 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Service d&apos;accueil</h2>
        <Link
          href="/admin/welcome-duty"
          className="text-xs text-icc-violet hover:text-icc-violet/80"
        >
          Gérer le pool →
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <>
          {assignments.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Affectées</p>
              <div className="flex flex-wrap gap-2">
                {assignments.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-icc-violet/10 text-icc-violet text-sm rounded-full font-medium"
                  >
                    {a.welcomeDutyFamily.familyName}
                    <button
                      onClick={() => remove(a.id)}
                      disabled={removing === a.id}
                      className="ml-0.5 text-icc-violet/60 hover:text-icc-violet disabled:opacity-50 leading-none"
                      aria-label="Retirer"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {suggestions.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                Suggestions (rotation)
              </p>
              <div className="space-y-1.5">
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-800">{s.familyName}</span>
                      <span className="ml-2 text-xs text-gray-400">{formatLastServed(s.lastServedAt)}</span>
                    </div>
                    <button
                      onClick={() => assign(s.id)}
                      disabled={assigning === s.id}
                      className="text-xs px-3 py-1 bg-icc-violet text-white rounded-full hover:bg-icc-violet/90 disabled:opacity-50 transition-colors"
                    >
                      {assigning === s.id ? "…" : "Affecter"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-gray-400">
              Aucune famille dans le pool.{" "}
              <Link href="/admin/welcome-duty" className="text-icc-violet hover:underline">
                Configurer le pool
              </Link>
            </p>
          ) : (
            <p className="text-xs text-gray-400">Toutes les familles du pool sont déjà affectées.</p>
          )}
        </>
      )}
    </div>
  );
}
