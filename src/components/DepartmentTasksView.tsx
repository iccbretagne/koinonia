"use client";

import { useState, useEffect, useCallback } from "react";

interface TaskItem {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

interface DepartmentTasksViewProps {
  departmentId: string;
  departmentName?: string;
  readOnly?: boolean;
}

export default function DepartmentTasksView({
  departmentId,
  departmentName,
  readOnly = false,
}: DepartmentTasksViewProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/departments/${departmentId}/tasks`);
      if (res.ok) {
        setTasks(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    setLoading(true);
    fetchTasks();
  }, [fetchTasks]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/departments/${departmentId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined }),
      });
      if (res.ok) {
        setName("");
        setDescription("");
        setShowForm(false);
        await fetchTasks();
      } else {
        const data = await res.json();
        setError(data.error || "Erreur lors de la création");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(taskId: string) {
    if (!confirm("Supprimer cette tâche ? Elle sera retirée de tous les événements."))
      return;
    try {
      const res = await fetch(`/api/departments/${departmentId}/tasks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      }
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        Chargement des tâches...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Tâches{departmentName ? ` — ${departmentName}` : ""}
        </h2>
        {!readOnly && (
          <button
            onClick={() => {
              setShowForm(true);
              setError(null);
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-icc-violet rounded-lg hover:bg-icc-violet/90 transition-colors"
          >
            + Nouvelle tâche
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Les tâches définies ici sont permanentes et apparaissent dans tous les événements du département.
      </p>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom de la tâche
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Mixage, Retours, Accueil VIP..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optionnel)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Détails sur la tâche..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-icc-violet focus:border-transparent"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 text-sm font-medium text-white bg-icc-violet rounded-lg hover:bg-icc-violet/90 disabled:opacity-50"
            >
              {saving ? "Création..." : "Créer"}
            </button>
          </div>
        </form>
      )}

      {tasks.length === 0 && !showForm ? (
        <div className="p-8 text-center text-gray-400 border-2 border-gray-200 border-dashed rounded-lg">
          Aucune tâche définie pour ce département
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">{task.name}</p>
                {task.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
                )}
              </div>
              {!readOnly && (
                <button
                  onClick={() => handleDelete(task.id)}
                  className="text-sm text-red-500 hover:text-red-700 ml-4"
                  title="Supprimer"
                >
                  Supprimer
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
