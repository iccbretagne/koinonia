import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Planificateur des tâches de `/api/cron` (ADR-0021).
 *
 * Un seul déclencheur externe (minuteur systemd, toutes les 5 minutes) appelle `/api/cron` ;
 * chaque tâche déclare son propre rythme et ne s'exécute que lorsqu'elle est due. L'état de
 * chaque tâche (dernier passage, durée, erreur, verrou) vit dans `cron_task_runs`.
 */
export type CronSchedule =
  /** À chaque appel du déclencheur. */
  | { kind: "every-run" }
  /** Au plus une fois par intervalle. */
  | { kind: "interval"; minutes: number }
  /** Une fois par jour, au premier appel à partir de cette heure (heure du serveur). */
  | { kind: "daily"; hour: number };

export type CronTask<T = unknown> = {
  key: string;
  schedule: CronSchedule;
  run: () => Promise<T>;
  /** Durée au-delà de laquelle un verrou est considéré comme abandonné (process tué). */
  leaseMinutes?: number;
};

export type CronTaskOutcome =
  | { status: "ran"; result: unknown; durationMs: number }
  | { status: "failed"; error: string; durationMs: number }
  | { status: "not-due" }
  | { status: "locked" };

/**
 * Le déclencheur n'est pas ponctuel (`RandomizedDelaySec`, durée des passages) : sans
 * tolérance, une tâche horaire appelée toutes les 5 minutes glisserait d'un passage par heure.
 */
const INTERVAL_TOLERANCE_MS = 2 * 60_000;
const DEFAULT_LEASE_MINUTES = 15;

export function isTaskDue(schedule: CronSchedule, lastStartedAt: Date | null, now: Date): boolean {
  switch (schedule.kind) {
    case "every-run":
      return true;
    case "interval":
      return (
        lastStartedAt === null ||
        now.getTime() - lastStartedAt.getTime() >= schedule.minutes * 60_000 - INTERVAL_TOLERANCE_MS
      );
    case "daily": {
      const todayAtHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), schedule.hour);
      return now >= todayAtHour && (lastStartedAt === null || lastStartedAt < todayAtHour);
    }
  }
}

/**
 * Prend la main sur une tâche : réussit seulement si personne ne l'a lancée depuis notre lecture
 * (`lastStartedAt` sert de jeton) et si aucun verrou n'est en cours. Deux appels concurrents ne
 * lancent donc jamais deux fois la même tâche.
 */
async function claim(key: string, seenStartedAt: Date | null, exists: boolean, now: Date, leaseMinutes: number) {
  const lockedUntil = new Date(now.getTime() + leaseMinutes * 60_000);
  if (!exists) {
    const { count } = await prisma.cronTaskRun.createMany({
      data: [{ key, lastStartedAt: now, lockedUntil }],
      skipDuplicates: true,
    });
    return count === 1;
  }
  const { count } = await prisma.cronTaskRun.updateMany({
    where: {
      key,
      lastStartedAt: seenStartedAt,
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { lastStartedAt: now, lockedUntil },
  });
  return count === 1;
}

async function runOne(task: CronTask, row: { lastStartedAt: Date | null } | undefined, now: Date): Promise<CronTaskOutcome> {
  const lastStartedAt = row?.lastStartedAt ?? null;
  if (!isTaskDue(task.schedule, lastStartedAt, now)) return { status: "not-due" };
  if (!(await claim(task.key, lastStartedAt, row !== undefined, now, task.leaseMinutes ?? DEFAULT_LEASE_MINUTES))) {
    return { status: "locked" };
  }

  const started = Date.now();
  let outcome: CronTaskOutcome;
  try {
    const result = await task.run();
    outcome = { status: "ran", result, durationMs: Date.now() - started };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ task: task.key, err: error }, "cron: échec de la tâche");
    outcome = { status: "failed", error, durationMs: Date.now() - started };
  }

  await prisma.cronTaskRun.update({
    where: { key: task.key },
    data: {
      lastFinishedAt: new Date(),
      lastDurationMs: outcome.durationMs,
      lastError: outcome.status === "failed" ? outcome.error : null,
      lockedUntil: null,
    },
  });
  return outcome;
}

/**
 * Exécute, en parallèle, les tâches dues. L'échec d'une tâche est consigné sur sa ligne et
 * n'empêche pas les autres de s'exécuter.
 */
export async function runScheduledTasks(
  tasks: CronTask[],
  now: Date = new Date()
): Promise<Record<string, CronTaskOutcome>> {
  const rows = await prisma.cronTaskRun.findMany({
    where: { key: { in: tasks.map((t) => t.key) } },
    select: { key: true, lastStartedAt: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const outcomes = await Promise.all(tasks.map((task) => runOne(task, byKey.get(task.key), now)));
  return Object.fromEntries(tasks.map((task, i) => [task.key, outcomes[i]]));
}
