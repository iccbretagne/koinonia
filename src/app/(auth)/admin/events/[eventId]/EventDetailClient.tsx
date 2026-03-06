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
  departments: Department[];
}

export default function EventDetailClient({ eventId, isRecurring, departments }: Props) {
  const [depts, setDepts] = useState(departments);
  const [loading, setLoading] = useState<string | null>(null);
  const [applyToSeries, setApplyToSeries] = useState(false);

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
