/**
 * T022 (spec 020) — la fiche d'événement (admin/events/[eventId]) signale un enregistrement
 * audio rattaché : absent, avancement en préparation, ou lien une fois publié.
 *
 * Un composant serveur Next.js n'est qu'une fonction async renvoyant un arbre d'éléments React
 * (pas de DOM à produire) : on l'appelle directement et on cherche le texte attendu dans l'arbre
 * renvoyé, sans dépendance à jsdom/testing-library qu'aucun autre test de ce dépôt n'utilise.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { prismaMock } from "@/__mocks__/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
  requireChurchPermission: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

const EventDetailPage = (await import("../page")).default;

const eventId = "event-1";
const churchId = "church-1";

function baseEvent() {
  return {
    id: eventId,
    title: "Culte du dimanche",
    type: "CULTE",
    date: new Date("2026-01-04"),
    churchId,
    isRecurrenceParent: false,
    seriesId: null,
    allowAnnouncements: false,
    trackedForDiscipleship: false,
    reportEnabled: false,
    statsEnabled: false,
    welcomeDutyEnabled: false,
    church: { id: churchId, name: "Église test" },
    eventDepts: [],
  };
}

/** Cherche récursivement un nœud texte dans l'arbre d'éléments React renvoyé par la page. */
function collectText(node: unknown, acc: string[] = []): string[] {
  if (typeof node === "string" || typeof node === "number") {
    acc.push(String(node));
  } else if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, acc));
  } else if (node && typeof node === "object" && "props" in node) {
    collectText((node as { props: { children?: ReactNode } }).props?.children, acc);
  }
  return acc;
}

describe("Fiche d'événement — bloc audio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.department.findMany.mockResolvedValue([]);
  });

  it("n'affiche rien quand aucun enregistrement n'est rattaché", async () => {
    prismaMock.event.findUnique.mockResolvedValue(baseEvent() as never);
    prismaMock.audioService.findUnique.mockResolvedValue(null);

    const page = await EventDetailPage({ params: Promise.resolve({ eventId }) });
    const text = collectText(page).join(" ");

    expect(text).not.toContain("Enregistrement audio");
  });

  it("affiche l'avancement pour un enregistrement en préparation", async () => {
    prismaMock.event.findUnique.mockResolvedValue(baseEvent() as never);
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: "audio-1",
      churchId,
      status: "READY",
      segments: [{ rendition: { id: "r1" } }, { rendition: null }],
    } as never);

    const page = await EventDetailPage({ params: Promise.resolve({ eventId }) });
    const text = collectText(page).join(" ");

    expect(text).toContain("Enregistrement audio");
    expect(text).toContain("En préparation");
    expect(text).toContain("1");
    expect(text).toContain("2");
  });

  it("affiche le lien d'écoute pour un enregistrement publié", async () => {
    prismaMock.event.findUnique.mockResolvedValue(baseEvent() as never);
    prismaMock.audioService.findUnique.mockResolvedValue({
      id: "audio-1",
      churchId,
      status: "PUBLISHED",
      segments: [],
    } as never);
    prismaMock.audioShareToken.findFirst.mockResolvedValue(null);
    prismaMock.audioShareToken.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "tok-1", ...data } as never)
    );

    const page = await EventDetailPage({ params: Promise.resolve({ eventId }) });
    const text = collectText(page).join(" ");

    expect(text).toContain("Écouter l'enregistrement");
  });
});
