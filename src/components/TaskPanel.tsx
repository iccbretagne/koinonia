"use client";

import { useState, useEffect, useCallback } from "react";
import { Check } from "lucide-react";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

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
  readonly eventId: string;
  readonly departmentId: string;
  readonly eligibleMembers: MemberRef[];
  readonly readOnly?: boolean;
}

export default function TaskPanel({
  eventId,
  departmentId,
  eligibleMembers,
  readOnly = false,
}: TaskPanelProps) {
  const toast = useToast();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/events/${eventId}/departments/${departmentId}/tasks`
      );
      if (res.ok) {
        setTasks(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [eventId, departmentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données au montage et au changement de dépendance
    void fetchTasks();
  }, [fetchTasks]);

  async function handleToggleMember(taskId: string, memberId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const eligibleIds = new Set(eligibleMembers.map((m) => m.id));
    const currentIds = task.assignments
      .map((a) => a.member.id)
      .filter((id) => eligibleIds.has(id));
    const newIds = currentIds.includes(memberId)
      ? currentIds.filter((id) => id !== memberId)
      : [...currentIds, memberId];

    setSavingTaskId(taskId);
    try {
      const res = await fetch(
        `/api/events/${eventId}/departments/${departmentId}/tasks`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, memberIds: newIds }),
        }
      );
      if (res.ok) {
        const updatedTask = await res.json();
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? updatedTask : t))
        );
      } else {
        toast.error("Tâche non attribuée. Réessayez dans un instant.");
      }
    } catch {
      toast.error("Tâche non attribuée. Vérifiez votre connexion.");
    } finally {
      setSavingTaskId(null);
    }
  }

  if (loading) {
    return <SkeletonList rows={2} label="Chargement des tâches…" />;
  }

  if (tasks.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="task-panel-title" className="flex flex-col gap-3">
      <div>
        <h3 id="task-panel-title" className="font-display text-[17px] font-semibold leading-6 text-ink">
          Tâches
        </h3>
        <p className="text-[13px] leading-[18px] text-ink-muted">
          {eligibleMembers.length > 0
            ? "Seuls les STAR en service peuvent recevoir une tâche."
            : "Placez des STAR en service pour leur attribuer une tâche."}
        </p>
      </div>

      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {tasks.map((task) => {
          const assignedIds = new Set(task.assignments.map((a) => a.member.id));
          const isSaving = savingTaskId === task.id;
          return (
            <li key={task.id} className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0">
              <div>
                <p className="text-[15px] font-semibold leading-[22px] text-ink">{task.name}</p>
                {task.description && (
                  <p className="text-[13px] leading-[18px] text-ink-muted">{task.description}</p>
                )}
              </div>

              {eligibleMembers.length > 0 && (
                <fieldset aria-label={`Attribuer « ${task.name} »`} className="flex min-w-0 flex-wrap gap-1.5" aria-busy={isSaving || undefined}>
                  {eligibleMembers.map((m) => {
                    const assigned = assignedIds.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={assigned}
                        disabled={readOnly || isSaving}
                        onClick={() => handleToggleMember(task.id, m.id)}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold leading-[18px] transition-colors duration-120
                          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed ${
                            assigned
                              ? "border-brand bg-brand-soft text-brand-text"
                              : "border-control-line bg-surface text-ink-muted hover:border-brand hover:text-ink"
                          } ${isSaving ? "opacity-60" : ""} ${readOnly && !assigned ? "opacity-60" : ""}`}
                      >
                        {assigned && <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />}
                        {m.firstName} {m.lastName}
                      </button>
                    );
                  })}
                </fieldset>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
