/** Démonstration hors ligne : aucune connexion DB, aucun email, aucune publication. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { defaultTicketVisualV2, ticketVisualSchema } from "../src/modules/ticketing/ticket-visual-schemas";
import { renderTicketV2, type TicketVariables } from "../src/modules/ticketing/services/ticket-render-v2";
import { createElement } from "react";
const TICKET_PREVIEW_NAMES = [["Jean", "Koné"], ["Marie-Claire", "Ouattara"], ["Jean-Baptiste", "Kouamé N'Guessan"], ["Marie-Angélique Jean-Baptiste", "De la Roche Saint-André Kouamé N'Guessan Ouattara"]];
async function ticketVisualPdf(png: Buffer) {
  const { Document, Image, Page, renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(createElement(Document, {}, createElement(Page, { size: [400, 600], style: { padding: 0 } }, createElement(Image, { src: { data: png, format: "png" }, style: { width: 400, height: 600 } }))));
}

async function main() {
  const destination = process.argv[2] ?? "/tmp/koinonia-ticket-v2";
  await mkdir(destination, { recursive: true });
  const doc = defaultTicketVisualV2();
  doc.elements.unshift({ id: "family", name: "Bannière familiale", type: "image", imageId: "demo-family", x: 50, y: 20, width: 900, height: 420, locked: true });
  ticketVisualSchema.parse(doc);
  const images = new Map([["demo-family", await readFile("docs/examples/ticket-v2/family.webp")]]);
  for (let i = 0; i < TICKET_PREVIEW_NAMES.length; i++) {
    const [first, last] = TICKET_PREVIEW_NAMES[i];
    const values: TicketVariables = {
      "participant.firstName": first, "participant.lastName": last, "participant.name": `${first} ${last}`,
      "ticket.category": i % 2 ? "Enfant" : "Adulte", "ticket.reference": "EXEMPLE-0042",
      "event.title": "Nuit de la Traversée 2027",
      "event.date": "jeudi 31 décembre 2026", "event.startTime": "18:00", "event.endTime": "05:00",
      "event.location": "Auditorium de Pacé", "event.address": "7 rue Charles Croizé, 35740 Pacé",
    };
    const png = await renderTicketV2(doc, values, "https://example.org/billet/apercu-fictif-non-valable", images);
    await writeFile(`${destination}/profile-${i}.png`, png);
    await writeFile(`${destination}/profile-${i}.pdf`, await ticketVisualPdf(png));
  }
  await writeFile(`${destination}/document.json`, JSON.stringify(doc, null, 2));
  console.log(`4 profils PNG/PDF et document V2 : ${destination}. Aucun billet valable, aucune mutation.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
