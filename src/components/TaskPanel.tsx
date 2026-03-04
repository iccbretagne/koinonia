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
  eligibleMembers: MemberRef[];
  readOnly?: boolean;
}

export default function TaskPanel({
  eventId,
  departmentId,
  eligibleMembers,
  readOnly = false,
}: TaskPanelProps) {
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
    fetchTasks();
  }, [fetchTasks]);

  async function handleToggleMember(taskId: string, memberId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const currentIds = task.assignments.map((a) => a.member.id);
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
      }
    } catch {
      // ignore
    } finally {
      setSavingTaskId(null);
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-400">Chargement des tâches...</div>;
  }

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 border-t pt-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Tâches</h3>

      <div className="space-y-2">
        {tasks.map((task) => {
          const assignedIds = new Set(task.assignments.map((a) => a.member.id));
          return (
            <div key={task.id} className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm font-medium text-gray-800">{task.name}</p>
              {task.description && (
                <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
              )}

              {eligibleMembers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {eligibleMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={readOnly || savingTaskId === task.id}
                      onClick={() => handleToggleMember(task.id, m.id)}
                      className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                        assignedIds.has(m.id)
                          ? "bg-icc-violet text-white border-icc-violet"
                          : readOnly
                            ? "bg-white text-gray-400 border-gray-200 cursor-not-allowed"
                            : "bg-white text-gray-600 border-gray-300 hover:border-icc-violet"
                      } ${savingTaskId === task.id ? "opacity-50" : ""}`}
                    >
                      {assignedIds.has(m.id) ? "\u2611 " : "\u2610 "}
                      {m.firstName} {m.lastName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
