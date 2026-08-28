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
  await prisma.msdpFollowUp.deleteMany();
  await prisma.familyIntegrationRequest.deleteMany();
  await prisma.familyLeaderAssignment.deleteMany();
  await prisma.agendaEntry.deleteMany();
  await prisma.roomChecklist.deleteMany();
  await prisma.roomReservation.deleteMany();
  await prisma.roomAccess.deleteMany();
  await prisma.room.deleteMany();
  await prisma.financialAttachment.deleteMany();
  await prisma.financialPayment.deleteMany();
  await prisma.financialRequest.deleteMany();
  await prisma.financialSeries.deleteMany();
  await prisma.jobOffer.deleteMany();
  await prisma.jobSeeker.deleteMany();
  await prisma.freelanceMission.deleteMany();
  await prisma.freelanceProfile.deleteMany();
  await prisma.appointmentRequest.deleteMany();
  await prisma.pastoralProfile.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.planning.deleteMany();
  await prisma.discipleshipAttendance.deleteMany();
  await prisma.discipleship.deleteMany();
  await prisma.absenceBackup.deleteMany();
  await prisma.absence.deleteMany();
  await prisma.request.deleteMany();
  await prisma.eventReportSection.deleteMany();
  await prisma.eventReport.deleteMany();
  await prisma.audioShareToken.deleteMany();
  await prisma.audioRendition.deleteMany();
  await prisma.audioSegment.deleteMany();
  await prisma.audioJob.deleteMany();
  await prisma.audioSource.deleteMany();
  await prisma.audioService.deleteMany();
  await prisma.audioServiceTemplate.deleteMany();
  await prisma.audioSettings.deleteMany();
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

  // ── Salles ────────────────────────────────────────────────────────────
  const admin = userByKey["admin"];
  const secretaireUser = userByKey["secretaire"];
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
      departmentId: departmentByKey["accueil"].id,
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
      departmentId: departmentByKey["logistique"].id,
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
      departmentId: departmentByKey["accueil"].id,
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
  const bergerUser = faiseurDisciplesMember ? userByKey["faiseur-disciples"] : admin;
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
