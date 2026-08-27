import type { AudioJob, AudioJobType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { probeHandler } from "./handlers/probe";
import { renderHandler } from "./handlers/render";
import { log, logError, since } from "./log";

// Le bail est court et renouvelé pendant le traitement (heartbeat) plutôt que dimensionné pour
// couvrir le plus long rendu imaginable : un bail expiré signifie alors « le worker est mort »,
// et non « le rendu prend plus de temps que prévu ». C'est ce qui rend la reprise d'un job
// interrompu sûre (voir leaseNextJob) sans risquer de doubler un rendu encore en cours.
const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 min
const LEASE_HEARTBEAT_MS = 60 * 1000; // renouvellement pendant le traitement
const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 3;

const handlers: Record<AudioJobType, (job: AudioJob) => Promise<void>> = {
  PROBE: probeHandler,
  RENDER: renderHandler,
  ALIGN: async () => {
    throw new Error("Job ALIGN non implémenté (P1.5)");
  },
  TRANSCRIBE: async () => {
    throw new Error("Job TRANSCRIBE non implémenté (P1.5)");
  },
};

/**
 * Prend un bail sur le plus ancien job disponible via `SELECT … FOR UPDATE SKIP LOCKED`
 * (MariaDB 10.11) — plusieurs instances du worker peuvent tourner en parallèle sans se marcher
 * dessus (ADR-0007).
 *
 * Les jobs `RUNNING` au bail expiré sont repris au même titre que les `PENDING` : un worker tué
 * en plein rendu (redéploiement, OOM) laisse sinon son job `RUNNING` pour toujours — personne ne
 * le reprend, et le culte reste indéfiniment « rendu en cours » sans qu'aucun rendu ne tourne
 * (retour terrain : worker relancé, aucun job traité, écran bloqué sur 5/6 séquences prêtes).
 * Sûr grâce au heartbeat de `processJob` : tant qu'un worker vit, il renouvelle son bail.
 */
async function leaseNextJob(): Promise<AudioJob | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM audio_jobs
      WHERE status IN ('PENDING', 'RUNNING')
        AND (leasedUntil IS NULL OR leasedUntil < NOW())
      ORDER BY createdAt ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    const row = rows[0];
    if (!row) return null;

    const job = await tx.audioJob.update({
      where: { id: row.id },
      data: {
        status: "RUNNING",
        leasedUntil: new Date(Date.now() + LEASE_DURATION_MS),
        attempts: { increment: 1 },
      },
    });

    const attempt = `tentative ${job.attempts}/${MAX_ATTEMPTS}`;
    if (row.status === "RUNNING") {
      // Signal important : ce job était réputé en cours d'exécution alors que personne ne le
      // traitait — le worker qui le tenait est mort sans passer par l'arrêt propre.
      logError(
        `job ${job.id} ${job.type} repris après expiration du bail — le worker précédent a été ` +
          `interrompu en plein traitement (${attempt})`
      );
    } else {
      log(`job ${job.id} ${job.type} pris (${attempt})`);
    }
    return job;
  });
}

async function processJob(job: AudioJob): Promise<void> {
  const handler = handlers[job.type];

  // Prolonge le bail tant que ce worker est vivant : sans cela, un rendu plus long que
  // LEASE_DURATION_MS serait repris en parallèle par une autre instance (cf. leaseNextJob).
  const startedAt = Date.now();

  // `updateMany` filtré sur RUNNING plutôt qu'`update` : un heartbeat qui se déclencherait
  // juste après la mise à jour terminale ne peut pas reposer un bail sur un job déjà DONE.
  // La ligne de journal sert aussi de preuve de vie sur un rendu long (une par minute).
  const heartbeat = setInterval(() => {
    void prisma.audioJob
      .updateMany({
        where: { id: job.id, status: "RUNNING" },
        data: { leasedUntil: new Date(Date.now() + LEASE_DURATION_MS) },
      })
      .then(() => log(`job ${job.id} toujours en cours (${since(startedAt)}) — bail prolongé`))
      .catch((err) => logError(`renouvellement du bail ${job.id} échoué :`, err));
  }, LEASE_HEARTBEAT_MS);

  try {
    await handler(job);
    await prisma.audioJob.update({
      where: { id: job.id },
      data: { status: "DONE", progress: 100, error: null, leasedUntil: null },
    });
    log(`job ${job.id} ${job.type} terminé en ${since(startedAt)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retriable = job.attempts < MAX_ATTEMPTS;
    await prisma.audioJob.update({
      where: { id: job.id },
      data: { status: retriable ? "PENDING" : "FAILED", leasedUntil: null, error: message },
    });
    logError(
      retriable
        ? `job ${job.id} ${job.type} en échec après ${since(startedAt)} ` +
            `(tentative ${job.attempts}/${MAX_ATTEMPTS}, sera réessayé) : ${message}`
        : `job ${job.id} ${job.type} en échec DÉFINITIF après ${MAX_ATTEMPTS} tentatives : ${message}`
    );
  } finally {
    clearInterval(heartbeat);
  }
}

/** Job en cours de traitement — remis en file si le worker est arrêté (voir shutdown). */
let currentJobId: string | null = null;

/** Traite au plus un job. Renvoie `false` si aucun job n'était disponible. */
async function runOnce(): Promise<boolean> {
  const job = await leaseNextJob();
  if (!job) return false;
  currentJobId = job.id;
  try {
    await processJob(job);
  } finally {
    currentJobId = null;
  }
  return true;
}

/**
 * Un redéploiement arrête le worker en plein rendu. Sans cette remise en file explicite, le job
 * n'est repris qu'à l'expiration de son bail (jusqu'à LEASE_DURATION_MS d'attente) ; on le rend
 * immédiatement disponible pour l'instance qui redémarre. `attempts` est décrémenté : une
 * interruption administrative n'est pas une tentative ratée du job et ne doit pas le rapprocher
 * de `FAILED`.
 */
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  if (currentJobId) {
    log(`${signal} reçu — remise en file du job ${currentJobId} en cours de traitement`);
    try {
      await prisma.audioJob.update({
        where: { id: currentJobId },
        data: { status: "PENDING", leasedUntil: null, attempts: { decrement: 1 } },
      });
      log(`job ${currentJobId} remis en PENDING — il repartira au redémarrage`);
    } catch (err) {
      logError("remise en file impossible :", err);
    }
  } else {
    log(`${signal} reçu — arrêt (aucun job en cours)`);
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

async function runLoop(): Promise<never> {
  // Les paramètres sont journalisés au démarrage : ils permettent de vérifier d'un coup d'œil
  // quelle version du worker tourne réellement sur l'hôte après un déploiement.
  log(
    `démarré — écoute de audio_jobs (bail ${LEASE_DURATION_MS / 60_000} min, ` +
      `heartbeat ${LEASE_HEARTBEAT_MS / 1000} s, sondage ${POLL_INTERVAL_MS / 1000} s, ` +
      `${MAX_ATTEMPTS} tentatives max)`
  );
  for (;;) {
    const worked = await runOnce();
    if (!worked) {
      // Volontairement silencieux : une ligne toutes les 5 s noierait le journal. L'absence de
      // ligne signifie « rien à faire » — les prises de job, elles, sont tracées.
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

runLoop().catch((err) => {
  logError("arrêt sur erreur fatale :", err);
  process.exit(1);
});
