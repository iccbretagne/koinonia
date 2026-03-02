"use client";

import { useState, useEffect, useCallback } from "react";

interface MemberRef {
  id: string;
  firstName: string;
  lastName: string;
}

interface TaskItem {
  id: string;
  name: string;
  description: string | null;
  assignments: { member: MemberRef }[];
}

interface TaskPanelProps {
  eventId: string;
  departmentId: string;
  members: { id: string; firstName: string; lastName: string }[];
  readOnly?: boolean;
}

export default function TaskPanel({
  eventId,
  departmentId,
  members,
  readOnly = false,
}: TaskPanelProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/events/${eventId}/departments/${departmentId}/tasks`
      );
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [eventId, departmentId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/departments/${departmentId}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: description || undefined,
            memberIds: Array.from(selectedMembers),
          }),
        }
      );
      if (res.ok) {
        const task = await res.json();
        setTasks((prev) => [...prev, task]);
        setName("");
        setDescription("");
        setSelectedMembers(new Set());
        setShowForm(false);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(taskId: string) {
    if (!confirm("Supprimer cette tâche ?")) return;
    try {
      const res = await fetch(
        `/api/events/${eventId}/departments/${departmentId}/tasks`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId }),
        }
      );
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      }
    } catch {
      // ignore
    }
  }

  function toggleMember(memberId: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  if (loading) {
    return <div className="text-sm text-gray-400">Chargement des tâches...</div>;
  }

  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Tâches</h3>
        {!readOnly && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs text-icc-violet hover:underline"
          >
            + Ajouter
          </button>
        )}
      </div>

      {tasks.length === 0 && !showForm && (
        <p className="text-xs text-gray-400 italic">Aucune tâche</p>
      )}

      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">{task.name}</p>
                {task.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
                )}
                {task.assignments.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {task.assignments
                      .map((a) => `${a.member.firstName} ${a.member.lastName}`)
                      .join(", ")}
                  </p>
                )}
              </div>
              {!readOnly && (
                <button
                  onClick={() => handleDelete(task.id)}
                  className="text-xs text-red-500 hover:text-red-700 ml-2"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mt-3 bg-gray-50 rounded-lg p-3 space-y-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de la tâche"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-icc-violet"
            required
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optionnel)"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-icc-violet"
          />
          {members.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Affecter à :</p>
              <div className="flex flex-wrap gap-1">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMember(m.id)}
                    className={`px-2 py-0.5 text-xs rounded-full border ${
                      selectedMembers.has(m.id)
                        ? "bg-icc-violet text-white border-icc-violet"
                        : "bg-white text-gray-600 border-gray-300 hover:border-icc-violet"
                    }`}
                  >
                    {m.firstName} {m.lastName}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-xs px-3 py-1 bg-icc-violet text-white rounded hover:bg-icc-violet/90 disabled:opacity-50"
            >
              {saving ? "..." : "Créer"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
