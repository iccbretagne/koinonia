import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MINISTRIES_AND_DEPARTMENTS: Record<string, string[]> = {
  Accueil: ["Accueil", "Protocole", "Parking"],
  Louange: ["Choristes", "Musiciens", "Son", "Vidéo/Régie"],
  Communication: ["Réseaux sociaux", "Design", "Photographie", "Vidéographie"],
  Intercession: ["Intercession culte", "Intercession permanente"],
  Enseignement: ["École du dimanche", "Adolescents", "Jeunes adultes"],
  Technique: ["Son", "Lumière", "Multimédia", "Streaming"],
  "Service d'ordre": ["Sécurité", "Premiers secours"],
};

async function main() {
  // Clean existing data (order matters for foreign keys)
  await prisma.planning.deleteMany();
  await prisma.eventDepartment.deleteMany();
  await prisma.event.deleteMany();
  await prisma.member.deleteMany();
  await prisma.userDepartment.deleteMany();
  await prisma.userChurchRole.deleteMany();
  await prisma.department.deleteMany();
  await prisma.ministry.deleteMany();
  await prisma.church.deleteMany();

  console.log("Existing data cleared");

  const church = await prisma.church.create({
    data: {
      name: "ICC Rennes",
      slug: "icc-rennes",
    },
  });

  console.log(`Church created: ${church.name}`);

  // Create system ministry + department (non-modifiable, non-deletable except by superAdmin)
  const systemMinistry = await prisma.ministry.create({
    data: {
      name: "Système",
      churchId: church.id,
      isSystem: true,
      departments: {
        create: {
          name: "Sans département",
          isSystem: true,
        },
      },
    },
  });
  console.log(`  System ministry: ${systemMinistry.name}`);

  for (const [ministryName, departments] of Object.entries(
    MINISTRIES_AND_DEPARTMENTS
  )) {
    const ministry = await prisma.ministry.create({
      data: {
        name: ministryName,
        churchId: church.id,
      },
    });

    console.log(`  Ministry: ${ministry.name}`);

    for (const deptName of departments) {
      const dept = await prisma.department.create({
        data: {
          name: deptName,
          ministryId: ministry.id,
        },
      });

      const memberCount = 3 + Math.floor(Math.random() * 3);
      const firstNames = [
        "Marie", "Jean", "Paul", "Sarah", "David",
        "Ruth", "Samuel", "Esther", "Daniel", "Rebecca",
      ];
      const lastNames = [
        "Dupont", "Martin", "Bernard", "Petit", "Robert",
        "Moreau", "Simon", "Laurent", "Michel", "Garcia",
      ];

      for (let i = 0; i < memberCount; i++) {
        await prisma.member.create({
          data: {
            firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
            lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
            departmentId: dept.id,
          },
        });
      }

      console.log(`    Department: ${deptName} (${memberCount} members)`);
    }
  }

  // Create upcoming events
  const now = new Date();

  for (let i = 0; i < 4; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i * 7);
    date.setHours(10, 0, 0, 0);

    await prisma.event.create({
      data: {
        title: `Culte du ${date.toLocaleDateString("fr-FR")}`,
        type: "CULTE",
        date,
        churchId: church.id,
      },
    });
  }

  // Create a prayer event
  const prayerDate = new Date(now);
  prayerDate.setDate(prayerDate.getDate() + 3);
  prayerDate.setHours(19, 0, 0, 0);

  await prisma.event.create({
    data: {
      title: "Soirée de prière",
      type: "PRIERE",
      date: prayerDate,
      churchId: church.id,
    },
  });

  console.log("Events created");

  // Link all departments to the first event
  const firstEvent = await prisma.event.findFirst({
    where: { churchId: church.id },
    orderBy: { date: "asc" },
  });

  if (firstEvent) {
    const allDepartments = await prisma.department.findMany();
    for (const dept of allDepartments) {
      await prisma.eventDepartment.create({
        data: {
          eventId: firstEvent.id,
          departmentId: dept.id,
        },
      });
    }
    console.log(
      `Linked ${allDepartments.length} departments to first event`
    );
  }

  console.log("Seed completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
