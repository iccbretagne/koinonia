"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import TaskPanel from "./TaskPanel";

interface MemberPlanning {
  id: string;
  firstName: string;
  lastName: string;
  status: string | null;
  planningId: string | null;
}

interface PlanningGridProps {
  eventId: string;
  departmentId: string;
  readOnly?: boolean;
}

const STATUS_OPTIONS = [
  { value: null, label: "-", color: "bg-gray-100 text-gray-500" },
  {
    value: "EN_SERVICE",
    label: "En service",
    color: "bg-green-100 text-green-800",
  },
  {
    value: "EN_SERVICE_DEBRIEF",
    label: "En service + Debrief",
    color: "bg-icc-violet-light text-icc-violet",
  },
  {
    value: "INDISPONIBLE",
    label: "Indisponible",
    color: "bg-red-100 text-red-800",
  },
  {
    value: "REMPLACANT",
    label: "Remplacant",
    color: "bg-blue-100 text-blue-800",
  },
];

export default function PlanningGrid({
  eventId,
  departmentId,
  readOnly = false,
}: PlanningGridProps) {
  const [members, setMembers] = useState<MemberPlanning[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [planningDeadline, setPlanningDeadline] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isReadOnly = readOnly || deadlinePassed;

  const fetchPlanning = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/departments/${departmentId}/planning`
      );
      if (!res.ok) throw new Error("Failed to fetch planning");
      const data = await res.json();
      setMembers(data.members);
      setDeadlinePassed(data.deadlinePassed ?? false);
      setPlanningDeadline(data.planningDeadline ?? null);
      setDirty(false);
    } catch (error) {
      console.error("Error fetching planning:", error);
    } finally {
      setLoading(false);
    }
  }, [eventId, departmentId]);

  useEffect(() => {
    fetchPlanning();
  }, [fetchPlanning]);

  const savePlanning = useCallback(
    async (updatedMembers: MemberPlanning[]) => {
      setSaving(true);
      try {
        const res = await fetch(
          `/api/events/${eventId}/departments/${departmentId}/planning`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              plannings: updatedMembers.map((m) => ({
                memberId: m.id,
                status: m.status,
              })),
            }),
          }
        );
        if (!res.ok) throw new Error("Failed to save planning");
        setDirty(false);
      } catch (error) {
        console.error("Error saving planning:", error);
      } finally {
        setSaving(false);
      }
    },
    [eventId, departmentId]
  );

  const handleStatusChange = (memberId: string, status: string | null) => {
    const updated = members.map((m) => {
      if (m.id === memberId) {
        return { ...m, status };
      }
      if (
        status === "EN_SERVICE_DEBRIEF" &&
        m.status === "EN_SERVICE_DEBRIEF"
      ) {
        return { ...m, status: "EN_SERVICE" };
      }
      return m;
    });

    setMembers(updated);
    setDirty(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => savePlanning(updated), 1000);
  };

  if (loading) {
    return (
      <div className="p-4 text-gray-500">Chargement du planning...</div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="p-4 text-gray-500">
        Aucun STAR dans ce département.
      </div>
    );
  }

  const enService = members.filter(
    (m) => m.status === "EN_SERVICE" || m.status === "EN_SERVICE_DEBRIEF"
  ).length;
  const indisponible = members.filter(
    (m) => m.status === "INDISPONIBLE"
  ).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-4 text-sm">
        <span className="text-green-700">
          En service : {enService}/{members.length}
        </span>
        <span className="text-red-700">Indisponibles : {indisponible}</span>
        {isReadOnly && (
          <span className="text-gray-400 italic">
            {deadlinePassed ? "Échéance dépassée" : "Lecture seule"}
          </span>
        )}
        {!isReadOnly && saving && <span className="text-blue-500">Enregistrement...</span>}
        {!isReadOnly && dirty && !saving && (
          <span className="text-orange-500">
            Modifications non sauvegardees
          </span>
        )}
        {!isReadOnly && !dirty && !saving && (
          <span className="text-green-500">Sauvegarde</span>
        )}
      </div>

      {planningDeadline && (
        <div
          className={`mb-3 px-3 py-2 text-xs rounded-lg ${
            deadlinePassed
              ? "bg-red-50 text-red-700"
              : "bg-blue-50 text-blue-700"
          }`}
        >
          {deadlinePassed ? "Échéance dépassée — " : "Échéance : "}
          {new Date(planningDeadline).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      )}

      {/* Mobile: card view */}
      <div className="md:hidden space-y-2">
        {members.map((member) => {
          const current = STATUS_OPTIONS.find((o) => o.value === member.status) || STATUS_OPTIONS[0];
          return (
            <div
              key={member.id}
              className={`flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 ${current.color}`}
            >
              <span className="text-sm font-medium truncate">
                {member.firstName} {member.lastName}
              </span>
              {isReadOnly ? (
                <span className="text-xs font-semibold shrink-0">{current.label}</span>
              ) : (
                <select
                  value={member.status || ""}
                  onChange={(e) =>
                    handleStatusChange(member.id, e.target.value || null)
                  }
                  className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white shrink-0"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value || "none"} value={option.value || ""}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: table view */}
      <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-sm font-medium text-left text-gray-700">
                STAR
              </th>
              <th className="px-4 py-3 text-sm font-medium text-center text-gray-700">
                Statut
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {members.map((member) => (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900">
                  {member.firstName} {member.lastName}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    {STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.value || "none"}
                        onClick={() =>
                          !isReadOnly && handleStatusChange(member.id, option.value)
                        }
                        disabled={isReadOnly}
                        className={`px-2 py-1 text-xs rounded-md transition-colors ${
                          member.status === option.value
                            ? option.color +
                              " font-semibold ring-2 ring-offset-1 ring-blue-400"
                            : isReadOnly
                              ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                              : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TaskPanel
        eventId={eventId}
        departmentId={departmentId}
        eligibleMembers={members
          .filter((m) => m.status === "EN_SERVICE" || m.status === "EN_SERVICE_DEBRIEF")
          .map((m) => ({ id: m.id, firstName: m.firstName, lastName: m.lastName }))}
        readOnly={isReadOnly}
      />
    </div>
  );
}
