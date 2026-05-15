/**
 * Détecte et supprime les enregistrements Planning/TaskAssignment futurs
 * dont le membre n'est plus rattaché au département concerné.
 *
 * Usage :
 *   tsx prisma/scripts/fix-planning-inconsistencies.ts          # dry-run (affiche sans supprimer)
 *   tsx prisma/scripts/fix-planning-inconsistencies.ts --apply  # supprime les incohérences
 */
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL!),
});

const dryRun = !process.argv.includes("--apply");

interface PlanningRow {
  id: string;
  memberId: string;
  memberName: string;
  departmentId: string;
  departmentName: string;
  eventId: string;
  eventTitle: string;
  eventDate: Date;
}

interface TaskAssignmentRow {
  id: string;
  memberId: string;
  memberName: string;
  departmentId: string;
  departmentName: string;
  eventId: string;
  eventTitle: string;
  eventDate: Date;
}

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`Mode : ${dryRun ? "DRY-RUN (aucune suppression)" : "APPLY (suppression réelle)"}`);
  console.log(`Date de référence : ${today.toLocaleDateString("fr-FR")}\n`);

  // --- Plannings incohérents ---
  const badPlannings = await prisma.$queryRaw<PlanningRow[]>`
    SELECT
      p.id,
      p.memberId,
      CONCAT(m.firstName, ' ', m.lastName) AS memberName,
      ed.departmentId,
      d.name AS departmentName,
      ed.eventId,
      e.title AS eventTitle,
      e.date AS eventDate
    FROM plannings p
    JOIN event_departments ed ON p.eventDepartmentId = ed.id
    JOIN events e ON ed.eventId = e.id
    JOIN members m ON p.memberId = m.id
    JOIN departments d ON ed.departmentId = d.id
    WHERE e.date >= ${today}
      AND NOT EXISTS (
        SELECT 1 FROM member_departments md
        WHERE md.memberId = p.memberId
          AND md.departmentId = ed.departmentId
      )
    ORDER BY e.date, m.lastName, m.firstName
  `;

  console.log(`Planning incohérents (événements futurs) : ${badPlannings.length}`);
  if (badPlannings.length > 0) {
    for (const row of badPlannings) {
      const date = new Date(row.eventDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
      console.log(`  • ${row.memberName} — ${row.departmentName} — ${row.eventTitle} (${date})`);
    }
  }

  // --- TaskAssignments incohérents ---
  const badTaskAssignments = await prisma.$queryRaw<TaskAssignmentRow[]>`
    SELECT
      ta.id,
      ta.memberId,
      CONCAT(m.firstName, ' ', m.lastName) AS memberName,
      t.departmentId,
      d.name AS departmentName,
      ta.eventId,
      e.title AS eventTitle,
      e.date AS eventDate
    FROM task_assignments ta
    JOIN tasks t ON ta.taskId = t.id
    JOIN events e ON ta.eventId = e.id
    JOIN members m ON ta.memberId = m.id
    JOIN departments d ON t.departmentId = d.id
    WHERE e.date >= ${today}
      AND NOT EXISTS (
        SELECT 1 FROM member_departments md
        WHERE md.memberId = ta.memberId
          AND md.departmentId = t.departmentId
      )
    ORDER BY e.date, m.lastName, m.firstName
  `;

  console.log(`\nTaskAssignment incohérents (événements futurs) : ${badTaskAssignments.length}`);
  if (badTaskAssignments.length > 0) {
    for (const row of badTaskAssignments) {
      const date = new Date(row.eventDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
      console.log(`  • ${row.memberName} — ${row.departmentName} — ${row.eventTitle} (${date})`);
    }
  }

  const total = badPlannings.length + badTaskAssignments.length;
  if (total === 0) {
    console.log("\n✓ Aucune incohérence détectée. Base de données cohérente.");
    return;
  }

  if (dryRun) {
    console.log(`\n⚠ ${total} enregistrement(s) à supprimer. Relancez avec --apply pour appliquer.`);
    return;
  }

  // --- Suppression ---
  console.log("\nSuppression en cours...");

  const planningIds = badPlannings.map((r) => r.id);
  const taskAssignmentIds = badTaskAssignments.map((r) => r.id);

  const [deletedPlannings, deletedTaskAssignments] = await prisma.$transaction([
    prisma.planning.deleteMany({ where: { id: { in: planningIds } } }),
    prisma.taskAssignment.deleteMany({ where: { id: { in: taskAssignmentIds } } }),
  ]);

  console.log(`✓ ${deletedPlannings.count} Planning supprimé(s)`);
  console.log(`✓ ${deletedTaskAssignments.count} TaskAssignment supprimé(s)`);
  console.log("\nNettoyage terminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
