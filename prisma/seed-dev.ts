import "dotenv/config";
import { fakerFR as faker } from "@faker-js/faker";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { CHURCHES, MINISTRIES, DEPARTMENTS, USERS, IS_REAL_STRUCTURE } from "./fixtures/active";

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

/**
 * Vide integralement la base, sauf l'historique des migrations.
 *
 * Les tables sont **decouvertes** dans `information_schema` plutot qu'enumerees :
 * une liste tenue a la main derive du schema des qu'un modele est ajoute, et
 * l'ordre des suppressions doit alors etre retrouve a chaque fois. C'est
 * exactement ce qui s'etait produit — 19 modeles sur 69 manquaient a l'appel,
 * sans consequence sur une base de developpement ou ces tables restent vides,
 * mais bloquant des la premiere base reellement utilisee.
 *
 * `FOREIGN_KEY_CHECKS = 0` rend l'ordre indifferent. Le drapeau est propre a la
 * session : tout se joue donc dans une transaction interactive, qui epingle une
 * connexion — sinon le pool pourrait executer les suppressions sur une autre
 * connexion, ou les contraintes sont restees actives.
 *
 * `_prisma_migrations` est explicitement preservee : la detruire ferait perdre
 * l'historique des migrations de la base (voir issue #499).
 */
async function wipe() {
  const rows = await prisma.$queryRaw<{ TABLE_NAME: string }[]>`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
  `;
  const tables = rows
    .map((r) => r.TABLE_NAME)
    .filter((name) => name !== "_prisma_migrations");

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
      for (const table of tables) {
        // Nom issu d'information_schema, jamais d'une entree utilisateur ; les
        // backticks couvrent les identifiants qui en auraient besoin.
        await tx.$executeRawUnsafe(`DELETE FROM \`${table}\``);
      }
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
    },
    // Une base reellement utilisee est plus lourde qu'une base de developpement :
    // le defaut de 5 s de Prisma ne suffit pas.
    { maxWait: 15_000, timeout: 180_000 }
  );

  return tables.length;
}

/**
 * Annonce la base visée avant de la vider.
 *
 * Ce script est destructif et peut désormais être pointé sur une base distante
 * (montage d'un environnement de formation via tunnel SSH). Afficher l'hôte et
 * le nom de la base est le garde-fou le moins cher contre la vraie erreur :
 * croire viser la recette et vider sa base locale, ou l'inverse.
 */
function describeTarget(): string {
  try {
    const url = new URL(process.env.DATABASE_URL!);
    return `${url.hostname}:${url.port || "3306"}${url.pathname}`;
  } catch {
    return "<DATABASE_URL illisible>";
  }
}

async function main() {
  console.log(`Cible : ${describeTarget()} — la base va être VIDÉE puis régénérée.`);
  const wipedTables = await wipe();
  console.log(`Base réinitialisée (${wipedTables} tables vidées)`);

  // ── Églises ──────────────────────────────────────────────────────────────
  const churchByKey: Record<string, { id: string }> = {};
  for (const c of CHURCHES) {
    churchByKey[c.key] = await prisma.church.create({
      data: { name: c.name, slug: c.slug, primaryColor: c.primaryColor },
    });
  }
  console.log(`${CHURCHES.length} églises créées`);

  // ── Ministères (+ ministère système par église) ─────────────────────────
  const ministryByKey: Record<string, { id: string }> = {};
  for (const m of MINISTRIES) {
    ministryByKey[m.key] = await prisma.ministry.create({
      data: { name: m.name, churchId: churchByKey[m.churchKey].id },
    });
  }
  for (const c of CHURCHES) {
    await prisma.ministry.create({
      data: {
        name: "Système",
        churchId: churchByKey[c.key].id,
        isSystem: true,
        departments: { create: { name: "Sans département", isSystem: true } },
      },
    });
  }
  console.log(`${MINISTRIES.length} ministères créés`);

  // ── Départements ─────────────────────────────────────────────────────────
  const departmentByKey: Record<string, { id: string; ministryId: string }> = {};
  for (const d of DEPARTMENTS) {
    departmentByKey[d.key] = await prisma.department.create({
      data: { name: d.name, ministryId: ministryByKey[d.ministryKey].id, function: d.function },
    });
  }
  console.log(`${DEPARTMENTS.length} départements créés`);

  // ── Membres (STAR) par département ─────────────────────────────────────
  const membersByDeptKey: Record<string, { id: string; firstName: string; lastName: string }[]> = {};
  for (const d of DEPARTMENTS) {
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

  // ── Comptes ─────────────────────────────────────────────────────────────
  // Une entrée USERS = un RÔLE, pas un compte : un même email peut en porter
  // plusieurs (dans la structure réelle, 25 comptes sur 41 sont à la fois
  // responsable, ministre et/ou STAR). Le compte est donc créé une seule fois,
  // puis chaque entrée y ajoute son `UserChurchRole` — sans quoi la contrainte
  // d'unicité sur `users.email` casse dès le deuxième rôle.
  const userByKey: Record<string, { id: string }> = {};
  const userByEmail: Record<string, { id: string }> = {};
  const linkedEmails = new Set<string>();
  const memberByUserEmail: Record<string, { id: string; firstName: string; lastName: string }> = {};

  // Département de repli pour la liaison membre d'un compte dont la fixture ne
  // précise pas de département (cas d'une fixture réelle).
  const firstDeptByChurchKey: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    const ministry = MINISTRIES.find((m) => m.key === d.ministryKey);
    if (ministry && !firstDeptByChurchKey[ministry.churchKey]) {
      firstDeptByChurchKey[ministry.churchKey] = d.key;
    }
  }

  // L'export de configuration ne porte pas `isDeputy` : quand la fixture ne le
  // précise pas, on reconstruit un binôme plausible — sur un département tenu
  // par plusieurs responsables, le premier déclaré est le principal, les suivants
  // sont adjoints. C'est une reconstruction, pas l'organisation réelle : elle
  // rend la distinction responsable/adjoint démontrable, et reste ajustable
  // depuis l'application.
  const reconstructedDeputies = new Map<string, Set<string>>();
  const principalSeenForDept = new Set<string>();
  for (const u of USERS) {
    if (u.role !== "DEPARTMENT_HEAD" || u.deputyDepartmentKeys?.length) continue;
    for (const deptKey of u.departmentKeys ?? []) {
      if (principalSeenForDept.has(deptKey)) {
        if (!reconstructedDeputies.has(u.key)) reconstructedDeputies.set(u.key, new Set());
        reconstructedDeputies.get(u.key)!.add(deptKey);
      } else {
        principalSeenForDept.add(deptKey);
      }
    }
  }

  for (const u of USERS) {
    let user = userByEmail[u.email];
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          displayName: u.displayName,
          emailVerified: TODAY,
          // church:manage / users:manage sont gérés par ce flag DB, indépendamment du rôle
          isSuperAdmin: USERS.some((o) => o.email === u.email && o.role === "SUPER_ADMIN"),
        },
      });
      userByEmail[u.email] = user;
    }
    userByKey[u.key] = user;

    const churchRole = await prisma.userChurchRole.create({
      data: {
        userId: user.id,
        churchId: churchByKey[u.churchKey].id,
        role: u.role,
        ministryId: u.ministryKey ? ministryByKey[u.ministryKey].id : undefined,
      },
    });

    const deputyKeys = new Set([
      ...(u.deputyDepartmentKeys ?? []),
      ...(reconstructedDeputies.get(u.key) ?? []),
    ]);
    for (const deptKey of u.departmentKeys ?? []) {
      await prisma.userDepartment.create({
        data: {
          userChurchRoleId: churchRole.id,
          departmentId: departmentByKey[deptKey].id,
          isDeputy: deputyKeys.has(deptKey),
        },
      });
    }

    // Un compte STAR ou Faiseur de disciples doit être lié à une fiche membre,
    // sans quoi « Mon planning » et le discipolat sont vides pour lui. La fixture
    // fictive désigne le département ; une fixture réelle ne le fait pas, on
    // retombe alors sur un département de son périmètre, ou le premier de son
    // église. Une seule liaison par compte, même s'il porte plusieurs rôles.
    const needsMemberLink = u.role === "STAR" || u.role === "DISCIPLE_MAKER";
    const linkDeptKey =
      u.linkedMemberDepartmentKey ??
      (needsMemberLink ? (u.departmentKeys?.[0] ?? firstDeptByChurchKey[u.churchKey]) : undefined);

    if (linkDeptKey && !linkedEmails.has(u.email)) {
      linkedEmails.add(u.email);
      const member = await prisma.member.create({
        data: {
          firstName: u.displayName,
          lastName: "(compte test)",
          email: u.email,
          departments: { create: { departmentId: departmentByKey[linkDeptKey].id, isPrimary: true } },
        },
      });
      membersByDeptKey[linkDeptKey].push(member);
      memberByUserEmail[u.email] = member;
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
  console.log(`${USERS.length} comptes de test créés`);

  // ── Événements, plannings et comptes rendus (église principale) ────────
  // Première église de la fixture : « Kervignac » pour le jeu fictif, l'église
  // réelle pour la fixture de formation, qui n'en compte qu'une.
  const mainChurchKey = CHURCHES[0].key;
  const mainDeptKeys = DEPARTMENTS.filter((d) => {
    const ministry = MINISTRIES.find((m) => m.key === d.ministryKey);
    return ministry?.churchKey === mainChurchKey;
  }).map((d) => d.key);

  // ── Repères de la fixture ───────────────────────────────────────────────
  // Les scénarios qui suivent (comptes rendus, absences, demandes, discipolat,
  // salles, tâches) doivent désigner « un département » et « un compte tenant
  // tel rôle ». Avec la fixture fictive ce sont les clés connues ; avec une
  // fixture réelle, dont les libellés diffèrent, on retombe sur un choix
  // déterministe dans l'église principale. Sans ces repères, tous ces blocs
  // seraient sautés en silence et l'environnement se retrouverait sans absence,
  // sans demande et sans réservation de salle.
  const deptAnchor = (preferred: string, fallbackIndex: number) =>
    mainDeptKeys.includes(preferred)
      ? preferred
      : mainDeptKeys[fallbackIndex % mainDeptKeys.length];

  const DEPT_A = deptAnchor("accueil", 0);
  const DEPT_B = deptAnchor("reseaux-sociaux", 1);
  const DEPT_C = deptAnchor("impact-junior", 2);
  const DEPT_LOGISTIQUE = deptAnchor("logistique", 3);
  const DEPT_EVANGELISATION = deptAnchor("evangelisation", 4);
  // Le secrétariat se reconnaît à sa fonction système, pas à son libellé.
  const DEPT_SECRETARIAT =
    DEPARTMENTS.find((d) => d.function === "SECRETARIAT" && mainDeptKeys.includes(d.key))?.key ??
    deptAnchor("secretariat", 5);

  /** Premier compte portant ce rôle dans l'église principale, s'il en existe un. */
  const userWithRole = (role: string) => {
    const entry = USERS.find((u) => u.role === role && u.churchKey === mainChurchKey);
    return entry ? userByKey[entry.key] : undefined;
  };

  // Repli garanti : une fixture n'est pas tenue de contenir tous les rôles, mais
  // les blocs ci-dessous ont besoin d'un auteur pour créer leurs objets.
  const fallbackUser = userByKey[USERS[0].key];

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
      for (const deptKey of [DEPT_A, DEPT_B, DEPT_C]) {
        await prisma.eventReportSection.create({
          data: {
            reportId: report.id,
            departmentId: departmentByKey[deptKey].id,
            label: DEPARTMENTS.find((d) => d.key === deptKey)!.name,
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

  // ── Audio (bibliothèque d'écoute, spec 021) ──────────────────────────────
  // Départements/orateurs/types différents pour que les filtres de la bibliothèque aient
  // matière à démontrer quelque chose. Les clés S3 sont fictives : sans MinIO configuré en
  // local, la lecture échoue au streaming — la liste, les filtres et la fiche restent
  // consultables, ce qui suffit à travailler l'UI de la bibliothèque.
  const pastEvents = events.filter((e) => e.isPast);
  const audioServiceDefs = [
    {
      planningEvent: pastEvents[0],
      title: "Vivre dans la victoire",
      speaker: "Pasteur Le Gall",
      type: "CULTE",
      serviceDate: daysFrom(TODAY, -42),
      segments: ["Louange", "Prédication", "Sainte Cène"],
    },
    {
      planningEvent: pastEvents[2],
      title: "Marcher par la foi",
      speaker: "Pasteur Morvan",
      type: "CULTE",
      serviceDate: daysFrom(TODAY, -28),
      segments: ["Louange", "Prédication"],
    },
    {
      planningEvent: null,
      title: "Soirée de formation des serviteurs",
      speaker: "Évangéliste Riou",
      type: "FORMATION",
      serviceDate: daysFrom(TODAY, -14),
      segments: ["Enseignement", "Questions/réponses"],
    },
  ];

  let audioSegmentCount = 0;
  for (const def of audioServiceDefs) {
    const service = await prisma.audioService.create({
      data: {
        churchId: churchByKey[mainChurchKey].id,
        planningEventId: def.planningEvent?.id ?? null,
        serviceDate: def.serviceDate,
        title: def.title,
        speaker: def.speaker,
        type: def.type,
        status: "PUBLISHED",
        publishedAt: def.serviceDate,
      },
    });

    for (let i = 0; i < def.segments.length; i++) {
      const segment = await prisma.audioSegment.create({
        data: {
          serviceId: service.id,
          order: i,
          kind: "SEQUENCE",
          title: def.segments[i],
          startMs: 0,
          endMs: 0,
          detectedBy: "manual",
        },
      });
      const durationMs = faker.number.int({ min: 8, max: 45 }) * 60_000; // 8 à 45 minutes
      await prisma.audioRendition.create({
        data: {
          segmentId: segment.id,
          s3Key: `dev-seed/audio/${service.id}/${segment.id}.mp3`,
          durationMs,
          lufs: -16,
          truePeakDb: -1.5,
          sourceHash: `dev-seed-${segment.id}`,
        },
      });
      audioSegmentCount++;
    }
  }
  console.log(`${audioServiceDefs.length} cultes audio publiés créés (${audioSegmentCount} séquences)`);

  // ── Absences (+ backup) ─────────────────────────────────────────────────
  const accueilMembers = membersByDeptKey[DEPT_A];
  const [absent, backup] = accueilMembers;
  const respAccueil = userWithRole("DEPARTMENT_HEAD");
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
  const secretaire = userWithRole("SECRETARY");
  const ministre = userWithRole("MINISTER");
  if (secretaire && ministre) {
    const secretariatDept = departmentByKey[DEPT_SECRETARIAT];
    await prisma.request.create({
      data: {
        churchId: churchByKey[mainChurchKey].id,
        type: "MODIFICATION_PLANNING",
        status: "EN_ATTENTE",
        title: "Modification planning Accueil",
        payload: { eventId: events[6]?.id ?? events[0].id, note: "Besoin d'un remplaçant" },
        submittedById: respAccueil?.id ?? secretaire.id,
        departmentId: departmentByKey[DEPT_A].id,
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
        payload: { requestedRole: "DEPARTMENT_HEAD", departmentId: departmentByKey[DEPT_LOGISTIQUE].id },
        submittedById: secretaire.id,
        reviewedById: (userWithRole("ADMIN") ?? secretaire).id,
        reviewNotes: "Département déjà pourvu.",
        reviewedAt: daysFrom(TODAY, -3),
      },
    });
  }
  console.log("Demandes créées");

  // ── Discipolat ────────────────────────────────────────────────────────
  const evangelisationMembers = membersByDeptKey[DEPT_EVANGELISATION];
  const faiseurDisciplesEntry = USERS.find(
    (u) => u.role === "DISCIPLE_MAKER" && u.churchKey === mainChurchKey
  );
  const faiseurDisciplesMember = faiseurDisciplesEntry
    ? memberByUserEmail[faiseurDisciplesEntry.email]
    : undefined;
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

  // ── Tâches de département (+ affectations sur les cultes) ──────────────
  // Chaque département repère reçoit quelques tâches récurrentes, affectées à
  // des membres sur les prochains cultes : sans cela, l'écran « Tâches » est
  // vide et la fonctionnalité n'est pas démontrable.
  const TASK_NAMES: Record<string, string[]> = {
    [DEPT_A]: ["Ouvrir les portes", "Distribuer les programmes", "Compter l'assemblée"],
    [DEPT_B]: ["Publier l'annonce du culte", "Photographier le culte"],
    [DEPT_C]: ["Préparer la salle enfants", "Accueillir les familles"],
  };
  const upcomingEvents = events.filter((e) => !e.isPast).slice(0, 3);
  let taskCount = 0;
  let assignmentCount = 0;

  for (const [deptKey, names] of Object.entries(TASK_NAMES)) {
    const deptMembers = membersByDeptKey[deptKey] ?? [];
    for (const name of names) {
      const task = await prisma.task.create({
        data: {
          departmentId: departmentByKey[deptKey].id,
          name,
          description: faker.lorem.sentence(),
        },
      });
      taskCount++;

      for (const event of upcomingEvents) {
        const member = faker.helpers.arrayElement(deptMembers);
        if (!member) continue;
        // `@@unique([taskId, eventId, memberId])` : un même membre peut être tiré
        // deux fois pour la même tâche et le même culte, on ignore le doublon.
        try {
          await prisma.taskAssignment.create({
            data: { taskId: task.id, memberId: member.id, eventId: event.id },
          });
          assignmentCount++;
        } catch {
          /* affectation déjà créée — sans conséquence */
        }
      }
    }
  }
  console.log(`${taskCount} tâches créées (${assignmentCount} affectations)`);

  // ── Salles ────────────────────────────────────────────────────────────
  const admin = userWithRole("ADMIN") ?? fallbackUser;
  const secretaireUser = userWithRole("SECRETARY");
  const room = await prisma.room.create({
    data: {
      name: "Salle polyvalente",
      churchId: churchByKey[mainChurchKey].id,
      capacity: 40,
      location: "Rez-de-chaussée",
    },
  });
  await prisma.roomReservation.create({
    data: {
      roomId: room.id,
      churchId: churchByKey[mainChurchKey].id,
      title: "Réunion d'équipe Accueil",
      startAt: daysFrom(TODAY, 4),
      endAt: daysFrom(TODAY, 4),
      createdById: respAccueil?.id ?? admin.id,
    },
  });
  const pastReservation = await prisma.roomReservation.create({
    data: {
      roomId: room.id,
      churchId: churchByKey[mainChurchKey].id,
      title: "Formation nouveaux membres",
      startAt: daysFrom(TODAY, -6),
      endAt: daysFrom(TODAY, -6),
      createdById: secretaireUser?.id ?? admin.id,
    },
  });
  await prisma.roomChecklist.create({
    data: {
      reservationId: pastReservation.id,
      status: "CLOSED_DECLARED",
      openedById: secretaireUser?.id ?? admin.id,
      openedAt: daysFrom(TODAY, -6),
      keyReceivedFromName: "Gardien",
      closedById: secretaireUser?.id ?? admin.id,
      closedAt: daysFrom(TODAY, -6),
      closedProperly: true,
      cleaned: true,
      equipmentOk: true,
      keyReturnedToName: "Gardien",
      closingNotes: "RAS, tout est en ordre.",
    },
  });
  console.log("Salle et réservations créées");

  // ── Agenda pastoral ──────────────────────────────────────────────────────
  const pastoralProfile = await prisma.pastoralProfile.create({
    data: {
      churchId: churchByKey[mainChurchKey].id,
      name: "Pasteur Kervignac",
      email: "pasteur@dev.local",
      role: "PASTEUR",
      // Volontairement non lié à un compte de test (userId) : un profil pastoral lié
      // bascule automatiquement l'interface de connexion en "vue pastorale" par défaut
      // (voir src/app/(auth)/layout.tsx), ce qui casse les captures admin standards.
    },
  });
  await prisma.appointmentRequest.create({
    data: {
      churchId: churchByKey[mainChurchKey].id,
      firstName: "Julie",
      lastName: "Fontaine",
      email: "julie.fontaine@dev.local",
      phone: "0612345678",
      subject: "Accompagnement familial",
      message: "Je souhaiterais échanger avec un pasteur au sujet d'une difficulté familiale.",
      status: "PENDING",
    },
  });
  await prisma.appointmentRequest.create({
    data: {
      churchId: churchByKey[mainChurchKey].id,
      firstName: "Marc",
      lastName: "Rousseau",
      email: "marc.rousseau@dev.local",
      phone: "0698765432",
      subject: "Préparation au mariage",
      message: "Nous aimerions préparer notre mariage avec un accompagnement pastoral.",
      status: "VALIDATED",
      assignedToId: pastoralProfile.id,
      qualifiedById: admin.id,
      qualifiedAt: daysFrom(TODAY, -1),
    },
  });
  console.log("Demandes de RDV pastoral créées");

  // ── Comptabilité ──────────────────────────────────────────────────────
  const financialSubmitter = respAccueil ?? admin;
  await prisma.financialRequest.create({
    data: {
      churchId: churchByKey[mainChurchKey].id,
      departmentId: departmentByKey[DEPT_A].id,
      submittedById: financialSubmitter.id,
      type: "EXPENSE_REPORT",
      label: "Achat de gobelets et café",
      description: "Fournitures pour l'accueil du dimanche.",
      amount: 34.9,
      status: "SUBMITTED",
      createdAt: daysFrom(TODAY, -2),
    },
  });
  await prisma.financialRequest.create({
    data: {
      churchId: churchByKey[mainChurchKey].id,
      departmentId: departmentByKey[DEPT_LOGISTIQUE].id,
      submittedById: ministre?.id ?? admin.id,
      type: "BUDGET_ADVANCE",
      label: "Location de matériel sono",
      description: "Avance pour la location de matériel pour l'événement jeunesse.",
      amount: 220,
      status: "PROCESSING",
      priority: "URGENT",
      createdAt: daysFrom(TODAY, -10),
    },
  });
  await prisma.financialRequest.create({
    data: {
      churchId: churchByKey[mainChurchKey].id,
      departmentId: departmentByKey[DEPT_A].id,
      submittedById: financialSubmitter.id,
      type: "EXPENSE_REPORT",
      label: "Remboursement déplacement formation",
      description: "Frais kilométriques pour une formation Accueil.",
      amount: 58,
      status: "APPROVED",
      processedById: admin.id,
      processedAt: daysFrom(TODAY, -30),
      createdAt: daysFrom(TODAY, -35),
    },
  });
  console.log("Demandes financières créées");

  // ── Emplois ───────────────────────────────────────────────────────────
  await prisma.jobOffer.create({
    data: {
      title: "Développeur web (H/F)",
      type: "EMPLOI",
      company: "Agence Web Bretagne",
      location: "Lorient",
      description: "Poste de développeur web fullstack au sein d'une agence locale.",
      contactEmail: "recrutement@dev.local",
      authorId: admin.id,
    },
  });
  await prisma.jobOffer.create({
    data: {
      title: "Alternance assistant comptable",
      type: "ALTERNANCE",
      company: "Cabinet Martin & Associés",
      location: "Vannes",
      description: "Alternance en comptabilité, rythme 3 semaines / 1 semaine.",
      contactEmail: "contact@dev.local",
      authorId: secretaireUser?.id ?? admin.id,
    },
  });
  await prisma.jobSeeker.create({
    data: {
      title: "Recherche poste d'aide-soignante",
      wantEmploi: true,
      sector: "Santé",
      location: "Kervignac",
      description: "Aide-soignante diplômée, disponible rapidement sur le secteur.",
      contactEmail: "candidat@dev.local",
      authorId: respAccueil?.id ?? admin.id,
    },
  });
  await prisma.freelanceMission.create({
    data: {
      title: "Création d'un site vitrine",
      domain: "Développement web",
      dailyRate: "300-400€",
      modality: "REMOTE",
      description: "Mission de création d'un site vitrine pour une petite entreprise locale.",
      contactEmail: "mission@dev.local",
      authorId: ministre?.id ?? admin.id,
    },
  });
  console.log("Offres et profils emploi créés");

  // ── Intégration ───────────────────────────────────────────────────────
  const bergerUser = userWithRole("DISCIPLE_MAKER") ?? admin;
  await prisma.familyLeaderAssignment.create({
    data: {
      churchId: churchByKey[mainChurchKey].id,
      userId: bergerUser.id,
      familyId: 101,
      familyName: "Famille Le Gall",
      role: "BERGER",
    },
  });
  await prisma.familyIntegrationRequest.create({
    data: {
      churchId: churchByKey[mainChurchKey].id,
      firstName: "Camille",
      lastName: "Le Gall",
      email: "camille.legall@dev.local",
      phone: "0611223344",
      city: "Kervignac",
      ageRange: "ADULT",
      churchStatus: "VISITOR",
      status: "SUBMITTED",
      submittedAt: daysFrom(TODAY, -3),
    },
  });
  const integrationRequestAssigned = await prisma.familyIntegrationRequest.create({
    data: {
      churchId: churchByKey[mainChurchKey].id,
      firstName: "Yann",
      lastName: "Cadoret",
      email: "yann.cadoret@dev.local",
      phone: "0655667788",
      city: "Kervignac",
      ageRange: "YOUNG_ADULT",
      churchStatus: "REGULAR",
      status: "ASSIGNED",
      assignedFamilyId: 101,
      assignedFamilyName: "Famille Le Gall",
      assignedBergerId: bergerUser.id,
      submittedAt: daysFrom(TODAY, -14),
      assignedAt: daysFrom(TODAY, -12),
      salvationCall: true,
    },
  });
  await prisma.msdpFollowUp.create({
    data: {
      churchId: churchByKey[mainChurchKey].id,
      requestId: integrationRequestAssigned.id,
      status: "CONTACTED",
      assignedConseillerMsdpId: admin.id,
      assignedAt: daysFrom(TODAY, -12),
      contactedAt: daysFrom(TODAY, -9),
      notes: "Premier contact chaleureux, poursuite du suivi la semaine prochaine.",
    },
  });
  console.log("Demandes d'intégration et suivi MSDP créés");

  // ── Journaux d'audit ──────────────────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      churchId: churchByKey[mainChurchKey].id,
      action: "UPDATE",
      entityType: "Member",
      entityId: accueilMembers[0]?.id ?? "seed",
      details: { field: "phone", before: "0600000000", after: "0612345678" },
      createdAt: daysFrom(TODAY, -1),
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: secretaireUser?.id ?? admin.id,
      churchId: churchByKey[mainChurchKey].id,
      action: "CREATE",
      entityType: "Event",
      entityId: events[0]?.id ?? "seed",
      details: { title: "Culte" },
      createdAt: daysFrom(TODAY, -5),
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      churchId: churchByKey[mainChurchKey].id,
      action: "DELETE",
      entityType: "Request",
      entityId: "seed-deleted-request",
      details: { title: "Ancienne demande annulée" },
      createdAt: daysFrom(TODAY, -20),
    },
  });
  console.log("Journaux d'audit créés");

  console.log(
    IS_REAL_STRUCTURE
      ? "Seed terminé — structure et comptes RÉELS, contenu métier fabriqué (formation)."
      : "Seed de développement terminé."
  );
  console.log(
    IS_REAL_STRUCTURE
      ? "Les participants se connectent avec leur compte Google habituel."
      : "Comptes de test disponibles : voir prisma/fixtures/dev-users.ts"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
