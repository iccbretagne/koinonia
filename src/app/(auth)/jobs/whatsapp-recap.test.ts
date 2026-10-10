import { describe, it, expect } from "vitest";
import { buildWhatsAppRecap, type RecapJob } from "./whatsapp-recap";

const ORIGIN = "https://koinonia.test";

// Dates construites avec le constructeur LOCAL puis converties en ISO, pour que
// la suite passe quel que soit le fuseau de la machine/CI (cf. rooms/calendar.test.ts).
const deadlineIso = new Date(2026, 8, 15).toISOString(); // 15 septembre 2026

function job(overrides: Partial<RecapJob> = {}): RecapJob {
  return {
    id: "abc123",
    title: "Développeur web",
    type: "EMPLOI",
    company: "ACME",
    location: "Rennes",
    deadline: null,
    ...overrides,
  };
}

describe("buildWhatsAppRecap — structure", () => {
  it("message complet pour 3 offres sans pastille : en-tête, 3 blocs, pied", () => {
    const jobs = [
      job({ id: "a", title: "Dev", company: "ACME" }),
      job({ id: "b", title: "Designer", company: "Beta" }),
      job({ id: "c", title: "PM", company: "Gamma" }),
    ];
    const msg = buildWhatsAppRecap(jobs, [], ORIGIN);

    expect(msg).toContain("📋 Opportunités — 3 opportunités disponibles");
    expect(msg).toContain(`${ORIGIN}/jobs/a`);
    expect(msg).toContain(`${ORIGIN}/jobs/b`);
    expect(msg).toContain(`${ORIGIN}/jobs/c`);
    expect(msg).toContain(`👉 Toutes les offres : ${ORIGIN}/jobs`);
    // 5 segments séparés par une ligne vide : header + 3 blocs + footer
    expect(msg.split("\n\n")).toHaveLength(5);
  });

  it("préserve l'ordre du tableau d'entrée", () => {
    const jobs = [job({ id: "z" }), job({ id: "a" }), job({ id: "m" })];
    const msg = buildWhatsAppRecap(jobs, [], ORIGIN);
    expect(msg.indexOf("/jobs/z")).toBeLessThan(msg.indexOf("/jobs/a"));
    expect(msg.indexOf("/jobs/a")).toBeLessThan(msg.indexOf("/jobs/m"));
  });

  it("chaque bloc contient type, intitulé, entreprise et le lien vers le détail", () => {
    const msg = buildWhatsAppRecap([job({ id: "x", title: "Dev", company: "ACME", type: "STAGE" })], [], ORIGIN);
    expect(msg).toContain("*Dev*");
    expect(msg).toContain("Stage · ACME");
    expect(msg).toContain(`${ORIGIN}/jobs/x`);
  });
});

describe("buildWhatsAppRecap — en-tête et filtre", () => {
  it("filtre STAGE : en-tête « Stages », seules les offres transmises apparaissent", () => {
    const msg = buildWhatsAppRecap([job({ id: "s1", type: "STAGE" })], ["STAGE"], ORIGIN);
    expect(msg).toContain("📋 Stages — 1 stage disponible");
    expect(msg).toContain("/jobs/s1");
  });

  it("accord du pluriel : 1 au singulier, 2 au pluriel", () => {
    expect(buildWhatsAppRecap([job()], [], ORIGIN)).toContain("1 opportunité disponible");
    expect(buildWhatsAppRecap([job({ id: "a" }), job({ id: "b" })], ["EMPLOI"], ORIGIN)).toContain(
      "2 offres disponibles"
    );
  });

  it("filtre ALTERNANCE : en-tête « Alternances »", () => {
    expect(buildWhatsAppRecap([job({ type: "ALTERNANCE" })], ["ALTERNANCE"], ORIGIN)).toContain(
      "📋 Alternances — 1 alternance disponible"
    );
  });

  it("liste vide : chaîne sans aucun bloc d'offre", () => {
    const msg = buildWhatsAppRecap([], [], ORIGIN);
    expect(msg).toContain("0 opportunité disponible");
    expect(msg).not.toContain("/jobs/");
    expect(msg).toContain(`👉 Toutes les offres : ${ORIGIN}/jobs`);
  });
});

describe("buildWhatsAppRecap — champs optionnels et sécurité du contenu", () => {
  it("location null : aucun segment lieu, aucun ` · ` orphelin, aucun « non renseigné »", () => {
    const msg = buildWhatsAppRecap([job({ location: null })], [], ORIGIN);
    expect(msg).toContain("Emploi · ACME\n");
    expect(msg).not.toContain("ACME · \n");
    expect(msg).not.toContain("non renseigné");
  });

  it("deadline null : aucune ligne de date", () => {
    const msg = buildWhatsAppRecap([job({ deadline: null })], [], ORIGIN);
    expect(msg).not.toContain("À postuler");
  });

  it("deadline renseignée : date en français dans le bloc", () => {
    const msg = buildWhatsAppRecap([job({ deadline: deadlineIso })], [], ORIGIN);
    expect(msg).toContain("À postuler avant le 15 septembre");
  });

  it("aucune coordonnée de contact ne ressort, même si l'objet en porte", () => {
    const tainted = {
      ...job(),
      contactEmail: "recruteur@example.com",
      contactUrl: "https://exemple.com/postuler",
    } as unknown as RecapJob;
    const msg = buildWhatsAppRecap([tainted], [], ORIGIN);
    expect(msg).not.toContain("recruteur@example.com");
    expect(msg).not.toContain("exemple.com/postuler");
  });

  it("titre contenant `*` : les astérisques du titre sont retirés", () => {
    const msg = buildWhatsAppRecap([job({ title: "Dev *senior*" })], [], ORIGIN);
    expect(msg).toContain("*Dev senior*");
    // gras équilibré : nombre pair d'astérisques sur la ligne du titre
    const titleLine = msg.split("\n").find((l) => l.includes("Dev senior"))!;
    expect((titleLine.match(/\*/g) ?? []).length % 2).toBe(0);
  });
});

describe("buildWhatsAppRecap — missions freelance (spec 064)", () => {
  const mission = job({ id: "m1", type: "MISSION", title: "Site vitrine", company: "Développement web", location: null, deadline: deadlineIso });

  it("bloc de mission : méta « Mission · domaine », lien vers la mission, pas de date limite", () => {
    const msg = buildWhatsAppRecap([mission], ["MISSION"], ORIGIN);
    expect(msg).toContain("📋 Missions freelance — 1 mission disponible");
    expect(msg).toContain("Mission · Développement web");
    expect(msg).toContain(`${ORIGIN}/jobs/freelance/missions/m1`);
    expect(msg).not.toContain(`${ORIGIN}/jobs/m1`);
    expect(msg).not.toContain("À postuler");
  });

  it("plusieurs pastilles ou aucune : en-tête « Opportunités », offres et missions mêlées", () => {
    const msg = buildWhatsAppRecap([job({ id: "o1" }), mission], ["EMPLOI", "MISSION"], ORIGIN);
    expect(msg).toContain("📋 Opportunités — 2 opportunités disponibles");
    expect(msg).toContain(`${ORIGIN}/jobs/o1`);
    expect(msg).toContain(`${ORIGIN}/jobs/freelance/missions/m1`);
  });
});
