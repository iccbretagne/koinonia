"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";

interface Department {
  id: string;
  name: string;
  ministryName: string;
  linked: boolean;
}

interface Props {
  eventId: string;
  isRecurring?: boolean;
  allowAnnouncements: boolean;
  departments: Department[];
}

export default function EventDetailClient({ eventId, isRecurring, allowAnnouncements: initialAllowAnnouncements, departments }: Props) {
  const [depts, setDepts] = useState(departments);
  const [loading, setLoading] = useState<string | null>(null);
  const [applyToSeries, setApplyToSeries] = useState(false);
  const [allowAnnouncements, setAllowAnnouncements] = useState(initialAllowAnnouncements);
  const [savingAnnouncements, setSavingAnnouncements] = useState(false);

  async function toggleAllowAnnouncements() {
    setSavingAnnouncements(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowAnnouncements: !allowAnnouncements }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur");
        return;
      }
      setAllowAnnouncements((v) => !v);
    } catch {
      alert("Erreur");
    } finally {
      setSavingAnnouncements(false);
    }
  }

  async function toggleDepartment(dept: Department) {
    setLoading(dept.id);

    try {
      const method = dept.linked ? "DELETE" : "POST";
      const res = await fetch(`/api/events/${eventId}/departments`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: dept.id,
          applyToSeries: applyToSeries && isRecurring,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur");
        return;
      }

      setDepts((prev) =>
        prev.map((d) =>
          d.id === dept.id ? { ...d, linked: !d.linked } : d
        )
      );
    } catch {
      alert("Erreur");
    } finally {
      setLoading(null);
    }
  }

  const grouped = depts.reduce(
    (acc, d) => {
      if (!acc[d.ministryName]) acc[d.ministryName] = [];
      acc[d.ministryName].push(d);
      return acc;
    },
    {} as Record<string, Department[]>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <Link href="/admin/events">
          <Button variant="secondary">&larr; Retour aux evenements</Button>
        </Link>
        <Link href={`/events/${eventId}/star-view`}>
          <Button>Voir planning des STAR</Button>
        </Link>
      </div>

      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Annonces
        </h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            role="switch"
            aria-checked={allowAnnouncements}
            onClick={toggleAllowAnnouncements}
            disabled={savingAnnouncements}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-icc-violet focus:ring-offset-2 disabled:opacity-50 ${
              allowAnnouncements ? "bg-icc-violet" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                allowAnnouncements ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm font-medium text-gray-700">
            Accepter les demandes d&apos;annonces
          </span>
          {allowAnnouncements && (
            <span className="text-xs bg-icc-violet/10 text-icc-violet px-2 py-0.5 rounded-full font-medium">
              Actif
            </span>
          )}
        </label>
        <p className="mt-2 text-xs text-gray-500">
          Si activé, cet événement apparaîtra dans le sélecteur lors de la
          soumission d&apos;une annonce.
        </p>
      </div>

      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Départements associés
      </h2>

      {isRecurring && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-icc-violet/5 border border-icc-violet/20 rounded-lg">
          <span className="text-icc-violet text-lg">↻</span>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={applyToSeries}
              onChange={(e) => setApplyToSeries(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
            />
            Appliquer aux futurs événements de la série
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(grouped).map(([ministry, deps]) => (
          <div key={ministry} className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">
              {ministry}
            </h3>
            <div className="space-y-2">
              {deps.map((d) => (
                <label
                  key={d.id}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={d.linked}
                    onChange={() => toggleDepartment(d)}
                    disabled={loading === d.id}
                    className="h-4 w-4 rounded border-gray-300 text-icc-violet focus:ring-icc-violet"
                  />
                  <span className="text-sm text-gray-700">
                    {d.name}
                    {loading === d.id && (
                      <span className="ml-2 text-gray-400">...</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
