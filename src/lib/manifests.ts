import { coreModule } from "@/modules/core/manifest";
import { planningModule } from "@/modules/planning/manifest";
import { discipleshipModule } from "@/modules/discipleship/manifest";
import { storageModule } from "@/modules/storage/manifest";
import { mediaModule } from "@/modules/media/manifest";
import { audioModule } from "@/modules/audio/manifest";
import { agendaModule } from "@/modules/agenda/manifest";
import { roomsModule } from "@/modules/rooms/manifest";
import { integrationModule } from "@/modules/integration/manifest";
import { accountingModule } from "@/modules/accounting/manifest";
import { jobsModule } from "@/modules/jobs/manifest";

/**
 * Les 11 manifestes, importés depuis `manifest.ts` (ADR-0011) et non depuis l'index du
 * module — un manifeste ne doit tirer ni Prisma, ni NextAuth, ni S3, pour rester
 * consommable par des outils qui n'ont besoin que de la déclaration (composition du
 * registry, résolution de routes, tests).
 *
 * Source unique consommée par `src/lib/registry.ts` **et** par `src/lib/module-routes.ts` —
 * les deux doivent voir exactement les mêmes modules dans le même ordre déclaratif (l'ordre
 * de chargement réel est de toute façon résolu par tri topologique dans `boot()`).
 */
export const allManifests = [
  coreModule,
  planningModule,
  discipleshipModule,
  storageModule,
  mediaModule,
  audioModule,
  agendaModule,
  roomsModule,
  integrationModule,
  accountingModule,
  jobsModule,
] as const;
