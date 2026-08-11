import "dotenv/config";
import { fakerFR as faker } from "@faker-js/faker";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEV_CHURCHES, DEV_MINISTRIES, DEV_DEPARTMENTS } from "./fixtures/dev-structure";
import { DEV_USERS } from "./fixtures/dev-users";

/**
 * Jeu de données fictif pour l'environnement de développement des contributeurs.
 *
 * Distinct de `prisma/seed.ts` (amorçage "ICC Rennes" réel, utilisé aussi en recette) :
 * ce script wipe et régénère l'intégralité de la base — y compris les utilisateurs —
 * il est réservé à une base de développement jetable (voir docker-compose.dev.yml),
 * jamais à exécuter contre une base de recette ou de production.
 *
 * Déterministe : la graine faker est fixe, une exécution produit toujours le même résultat.
 */
faker.seed(20260812);

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });

const FIRST_NAMES = [
  "Marie", "Jean", "Paul", "Sarah", "David", "Ruth", "Samuel", "Esther",
  "Daniel", "Rebecca", "Grace", "Emmanuel", "Naomi", "Josué", "Deborah",
  "Nathan", "Priscille", "Timothée", "Anne", "Pierre",
];
const LAST_NAMES = [
  "Dupont", "Martin", "Bernard", "Petit", "Robert", "Moreau", "Simon",
  "Laurent", "Michel", "Garcia", "Fontaine", "Rousseau", "Leroy", "Girard",
];

function fakeMemberName() {
  return {
    firstName: faker.helpers.arrayElement(FIRST_NAMES),
    lastName: faker.helpers.arrayElement(LAST_NAMES),
  };
}

// Ancre temporelle fixe (déterminisme) — "aujourd'hui" pour le jeu de données dev.
const TODAY = new Date("2026-08-01T08:00:00.000Z");
function daysFrom(base: Date, days: number) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function wipe() {
  await prisma.planning.deleteMany();
  await prisma.discipleshipAttendance.deleteMany();
  await prisma.discipleship.deleteMany();
  await prisma.absenceBackup.deleteMany();
  await prisma.absence.deleteMany();
  await prisma.request.deleteMany();
  await prisma.eventReportSection.deleteMany();
  await prisma.eventReport.deleteMany();
  await prisma.eventDepartment.deleteMany();
  await prisma.event.deleteMany();
  await prisma.memberUserLink.deleteMany();
  await prisma.memberDepartment.deleteMany();
  await prisma.member.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.userDepartment.deleteMany();
  await prisma.userChurchRole.deleteMany();
  await prisma.department.deleteMany();
  await prisma.ministry.deleteMany();
  await prisma.user.deleteMany();
  await prisma.church.deleteMany();
}

async function main() {
  await wipe();
  console.log("Base de développement réinitialisée");

  // ── Églises ──────────────────────────────────────────────────────────────
  const churchByKey: Record<string, { id: string }> = {};
  for (const c of DEV_CHURCHES) {
    churchByKey[c.key] = await prisma.church.create({
      data: { name: c.name, slug: c.slug, primaryColor: c.primaryColor },
    });
  }
  console.log(`${DEV_CHURCHES.length} églises créées`);

  // ── Ministères (+ ministère système par église) ─────────────────────────
  const ministryByKey: Record<string, { id: string }> = {};
  for (const m of DEV_MINISTRIES) {
    ministryByKey[m.key] = await prisma.ministry.create({
      data: { name: m.name, churchId: churchByKey[m.churchKey].id },
    });
  }
  for (const c of DEV_CHURCHES) {
    await prisma.ministry.create({
      data: {
        name: "Système",
        churchId: churchByKey[c.key].id,
        isSystem: true,
        departments: { create: { name: "Sans département", isSystem: true } },
      },
    });
  }
  console.log(`${DEV_MINISTRIES.length} ministères créés`);

  // ── Départements ─────────────────────────────────────────────────────────
  const departmentByKey: Record<string, { id: string; ministryId: string }> = {};
  for (const d of DEV_DEPARTMENTS) {
    departmentByKey[d.key] = await prisma.department.create({
      data: { name: d.name, ministryId: ministryByKey[d.ministryKey].id, function: d.function },
    });
  }
  console.log(`${DEV_DEPARTMENTS.length} départements créés`);

  // ── Membres (STAR) par département ─────────────────────────────────────
  const membersByDeptKey: Record<string, { id: string; firstName: string; lastName: string }[]> = {};
  for (const d of DEV_DEPARTMENTS) {
    const count = faker.number.int({ min: 4, max: 9 });
    membersByDeptKey[d.key] = [];
    for (let i = 0; i < count; i++) {
      const { firstName, lastName } = fakeMemberName();
      const member = await prisma.member.create({
        data: {
          firstName,
          lastName,
          email: `${firstName}.${lastName}.${i}@dev.local`.toLowerCase(),
          phone: faker.phone.number({ style: "national" }),
          departments: { create: { departmentId: departmentByKey[d.key].id, isPrimary: true } },
        },
      });
      membersByDeptKey[d.key].push(member);
    }
  }
  const totalMembers = Object.values(membersByDeptKey).reduce((n, list) => n + list.length, 0);
  console.log(`${totalMembers} membres (STAR) créés`);

  // ── Comptes de test (un par rôle métier) ────────────────────────────────
  const userByKey: Record<string, { id: string }> = {};
  for (const u of DEV_USERS) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        displayName: u.displayName,
        emailVerified: TODAY,
        // church:manage / users:manage sont gérés par ce flag DB, indépendamment du rôle
        isSuperAdmin: u.role === "SUPER_ADMIN",
      },
    });
    userByKey[u.key] = user;

    const churchRole = await prisma.userChurchRole.create({
      data: {
        userId: user.id,
        churchId: churchByKey[u.churchKey].id,
        role: u.role,
        ministryId: u.ministryKey ? ministryByKey[u.ministryKey].id : undefined,
      },
    });

    for (const deptKey of u.departmentKeys ?? []) {
      await prisma.userDepartment.create({
        data: { userChurchRoleId: churchRole.id, departmentId: departmentByKey[deptKey].id },
      });
    }

    if (u.linkedMemberDepartmentKey) {
      const member = await prisma.member.create({
        data: {
          firstName: u.displayName,
          lastName: "(compte test)",
          email: u.email,
          departments: { create: { departmentId: departmentByKey[u.linkedMemberDepartmentKey].id, isPrimary: true } },
        },
      });
      membersByDeptKey[u.linkedMemberDepartmentKey].push(member);
      await prisma.memberUserLink.create({
        data: {
          memberId: member.id,
          userId: user.id,
          churchId: churchByKey[u.churchKey].id,
          validatedAt: TODAY,
        },
      });
    }
  }
  console.log(`${DEV_USERS.length} comptes de test créés`);

  // ── Événements, plannings et comptes rendus (église principale) ────────
  const mainChurchKey = "kervignac";
  const mainDeptKeys = DEV_DEPARTMENTS.filter((d) => {
    const ministry = DEV_MINISTRIES.find((m) => m.key === d.ministryKey);
    return ministry?.churchKey === mainChurchKey;
  }).map((d) => d.key);

  const events: { id: string; isPast: boolean }[] = [];
  // 6 cultes passés + 6 cultes à venir, un pour chaque dimanche autour de l'ancre TODAY
  for (let week = -6; week <= 6; week++) {
    const date = daysFrom(TODAY, week * 7);
    const isPast = date < TODAY;
    const event = await prisma.event.create({
      data: {
        title: `Culte du ${date.toLocaleDateString("fr-FR")}`,
        type: "CULTE",
        date,
        churchId: churchByKey[mainChurchKey].id,
        reportEnabled: isPast,
        statsEnabled: true,
      },
    });
    events.push({ id: event.id, isPast });

    // Rattacher tous les départements de l'église principale + créer le planning
    for (const deptKey of mainDeptKeys) {
      const eventDept = await prisma.eventDepartment.create({
        data: { eventId: event.id, departmentId: departmentByKey[deptKey].id },
      });
      const members = membersByDeptKey[deptKey];
      const onDuty = faker.helpers.arrayElements(members, Math.min(3, members.length));
      for (const member of onDuty) {
        await prisma.planning.create({
          data: {
            eventDepartmentId: eventDept.id,
            memberId: member.id,
            status: isPast
              ? faker.helpers.arrayElement(["EN_SERVICE_DEBRIEF", "INDISPONIBLE"])
              : faker.helpers.arrayElement(["EN_SERVICE", "REMPLACANT", "INDISPONIBLE"]),
          },
        });
      }
    }

    if (isPast) {
      const report = await prisma.eventReport.create({
        data: {
          eventId: event.id,
          churchId: churchByKey[mainChurchKey].id,
          speaker: `Pasteur ${faker.helpers.arrayElement(LAST_NAMES)}`,
          messageTitle: faker.lorem.words({ min: 3, max: 6 }),
          notes: faker.lorem.paragraph(),
        },
      });
      let position = 0;
      for (const deptKey of ["accueil", "reseaux-sociaux", "impact-junior"]) {
        await prisma.eventReportSection.create({
          data: {
            reportId: report.id,
            departmentId: departmentByKey[deptKey].id,
            label: DEV_DEPARTMENTS.find((d) => d.key === deptKey)!.name,
            position: position++,
            stats: { presents: faker.number.int({ min: 40, max: 220 }) },
            notes: faker.lorem.sentence(),
          },
        });
      }
    }
  }

  // Quelques événements ponctuels (prière, discipolat)
  await prisma.event.create({
    data: {
      title: "Soirée de prière",
      type: "PRIERE",
      date: daysFrom(TODAY, 3),
      churchId: churchByKey[mainChurchKey].id,
    },
  });
  await prisma.event.create({
    data: {
      title: "Rencontre discipolat",
      type: "DISCIPOLAT",
      date: daysFrom(TODAY, -2),
      churchId: churchByKey[mainChurchKey].id,
      trackedForDiscipleship: true,
    },
  });
  console.log(`${events.length + 2} événements créés`);

  // ── Absences (+ backup) ─────────────────────────────────────────────────
  const accueilMembers = membersByDeptKey["accueil"];
  const [absent, backup] = accueilMembers;
  const respAccueil = userByKey["resp-accueil"];
  if (absent && backup && respAccueil) {
    const absence = await prisma.absence.create({
      data: {
        memberId: absent.id,
        churchId: churchByKey[mainChurchKey].id,
        startDate: daysFrom(TODAY, 5),
        endDate: daysFrom(TODAY, 12),
        reason: "Congés",
        createdById: respAccueil.id,
      },
    });
    await prisma.absenceBackup.create({
      data: { absenceId: absence.id, type: "STAR", memberId: backup.id },
    });
  }
  const cancelledMember = accueilMembers[2];
  if (cancelledMember && respAccueil) {
    await prisma.absence.create({
      data: {
        memberId: cancelledMember.id,
        churchId: churchByKey[mainChurchKey].id,
        startDate: daysFrom(TODAY, -10),
        endDate: daysFrom(TODAY, -8),
        reason: "Déplacement professionnel",
        status: "CANCELLED",
        createdById: respAccueil.id,
        cancelledById: respAccueil.id,
        cancelledAt: daysFrom(TODAY, -9),
      },
    });
  }
  console.log("Absences créées");

  // ── Demandes (Request) — tous statuts, quelques types ───────────────────
  const secretaire = userByKey["secretaire"];
  const ministre = userByKey["ministre"];
  if (secretaire && ministre) {
    const secretariatDept = departmentByKey["secretariat"];
    await prisma.request.create({
      data: {
        churchId: churchByKey[mainChurchKey].id,
        type: "MODIFICATION_PLANNING",
        status: "EN_ATTENTE",
        title: "Modification planning Accueil",
        payload: { eventId: events[6]?.id ?? events[0].id, note: "Besoin d'un remplaçant" },
        submittedById: respAccueil?.id ?? secretaire.id,
        departmentId: departmentByKey["accueil"].id,
      },
    });
    await prisma.request.create({
      data: {
        churchId: churchByKey[mainChurchKey].id,
        type: "DIFFUSION_INTERNE",
        status: "APPROUVEE",
        title: "Annonce — Barbecue annuel",
        payload: { message: "Barbecue annuel le mois prochain, inscriptions ouvertes." },
        submittedById: ministre.id,
        assignedDeptId: secretariatDept.id,
        reviewedById: secretaire.id,
        reviewedAt: daysFrom(TODAY, -1),
      },
    });
    await prisma.request.create({
      data: {
        churchId: churchByKey[mainChurchKey].id,
        type: "DEMANDE_ACCES",
        status: "REFUSEE",
        title: "Demande d'accès Resp. département",
        payload: { requestedRole: "DEPARTMENT_HEAD", departmentId: departmentByKey["logistique"].id },
        submittedById: secretaire.id,
        reviewedById: userByKey["admin"].id,
        reviewNotes: "Département déjà pourvu.",
        reviewedAt: daysFrom(TODAY, -3),
      },
    });
  }
  console.log("Demandes créées");

  // ── Discipolat ────────────────────────────────────────────────────────
  const evangelisationMembers = membersByDeptKey["evangelisation"];
  const faiseurDisciplesMember = evangelisationMembers.find((m) => m.lastName === "(compte test)");
  const discipleCandidates = evangelisationMembers.filter((m) => m !== faiseurDisciplesMember).slice(0, 3);
  if (faiseurDisciplesMember) {
    for (const disciple of discipleCandidates) {
      await prisma.discipleship.create({
        data: {
          discipleId: disciple.id,
          discipleMakerId: faiseurDisciplesMember.id,
          firstMakerId: faiseurDisciplesMember.id,
          churchId: churchByKey[mainChurchKey].id,
        },
      });
    }
  }
  console.log(`${discipleCandidates.length} relations de discipolat créées`);

  console.log("Seed de développement terminé.");
  console.log("Comptes de test disponibles : voir prisma/fixtures/dev-users.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
