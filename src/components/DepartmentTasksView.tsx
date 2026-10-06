"use client";

import { SubmitEvent, useCallback, useEffect, useState } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import EmptyState from "@/components/ui/EmptyState";
import Input from "@/components/ui/Input";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ghostDangerClasses } from "./ghost-danger";

interface TaskItem {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

interface DepartmentTasksViewProps {
  readonly departmentId: string;
  readonly departmentName?: string;
  readonly readOnly?: boolean;
}

export default function DepartmentTasksView({
  departmentId,
  departmentName,
  readOnly = false,
}: DepartmentTasksViewProps) {
  const toast = useToast();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaskItem | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    void fetchTasks();
  }, [fetchTasks]);

  async function handleCreate(e: SubmitEvent) {
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
        toast.success("Tâche créée");
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
    setDeleting(true);
    try {
      const res = await fetch(`/api/departments/${departmentId}/tasks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        toast.success("Tâche supprimée");
      } else {
        toast.error("Suppression impossible. Réessayez dans un instant.");
      }
    } catch {
      toast.error("Suppression impossible. Vérifiez votre connexion.");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  if (loading) {
    return <SkeletonList rows={4} label="Chargement des tâches…" />;
  }

  const openForm = () => {
    setShowForm(true);
    setError(null);
  };

  return (
    <section aria-labelledby="department-tasks-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="department-tasks-title" className="font-display text-[17px] font-semibold leading-6 text-ink">
            Tâches permanentes{departmentName ? ` — ${departmentName}` : ""}
          </h2>
          <p className="text-[13px] leading-[18px] text-ink-muted">
            Elles apparaissent dans tous les événements du département.
          </p>
        </div>
        {!readOnly && !showForm && tasks.length > 0 && (
          <Button size="sm" onClick={openForm}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Nouvelle tâche
          </Button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
          <Input
            label="Nom de la tâche"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. : mixage, retours, accueil VIP…"
            required
            autoFocus
          />
          <Input
            label="Description (facultatif)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Détails sur la tâche…"
            error={error ?? undefined}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Création…" : "Créer la tâche"}
            </Button>
          </div>
        </form>
      )}

      {tasks.length === 0 && !showForm ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={ListChecks}
            title="Aucune tâche pour ce département"
            description={
              readOnly
                ? "Le responsable du département n'a pas encore défini de tâche."
                : "Définissez les tâches (mixage, retours…) à répartir entre les STAR en service."
            }
            action={
              !readOnly ? (
                <Button onClick={openForm}>
                  <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Nouvelle tâche
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        tasks.length > 0 && (
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex min-h-16 items-center justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-[22px] text-ink">{task.name}</p>
                  {task.description && (
                    <p className="text-[13px] leading-[18px] text-ink-muted">{task.description}</p>
                  )}
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setPendingDelete(task)}
                    className={`${ghostDangerClasses} shrink-0`}
                    aria-label={`Supprimer la tâche « ${task.name} »`}
                  >
                    <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    <span className="hidden sm:inline">Supprimer</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title="Supprimer cette tâche ?"
        message={`« ${pendingDelete?.name ?? ""} » sera retirée de tous les événements du département.`}
        confirmLabel="Supprimer la tâche"
        confirmingLabel="Suppression…"
        variant="danger"
        confirming={deleting}
        onConfirm={() => pendingDelete && handleDelete(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
