import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CircleCheck, CircleX, MessageSquare, Repeat } from "lucide-react";
import StatusChip, { statusToneClasses } from "../StatusChip";
import {
  SERVICE_STATUS,
  SERVICE_STATUS_ORDER,
  isServiceStatus,
  serviceStatusDescriptor,
} from "../status";
import { buttonClasses, variantClasses } from "../button-classes";
import { Badge, formatCount } from "../Badge";
import { selectionLabel } from "../BulkActionBar";
import { isTabActive } from "../Tabs";

type ChipProps = ComponentProps<typeof StatusChip>;

describe("SERVICE_STATUS", () => {
  it("associe chaque statut de service à sa tonalité, son icône et son libellé accentué", () => {
    expect(SERVICE_STATUS.EN_SERVICE).toEqual({ tone: "success", icon: CircleCheck, label: "En service" });
    expect(SERVICE_STATUS.EN_SERVICE_DEBRIEF).toEqual({
      tone: "brand",
      icon: MessageSquare,
      label: "En service + Debrief",
    });
    expect(SERVICE_STATUS.INDISPONIBLE).toEqual({ tone: "danger", icon: CircleX, label: "Indisponible" });
    expect(SERVICE_STATUS.REMPLACANT).toEqual({ tone: "info", icon: Repeat, label: "Remplaçant" });
    expect(SERVICE_STATUS_ORDER).toEqual(Object.keys(SERVICE_STATUS));
  });

  it("reconnaît les statuts de l'API et ignore le reste", () => {
    expect(isServiceStatus("REMPLACANT")).toBe(true);
    expect(isServiceStatus("toString")).toBe(false);
    expect(serviceStatusDescriptor(null)).toBeNull();
    expect(serviceStatusDescriptor("INCONNU")).toBeNull();
    expect(serviceStatusDescriptor("INDISPONIBLE")?.label).toBe("Indisponible");
  });
});

describe("StatusChip", () => {
  it("affiche toujours le mot, avec la couleur de la tonalité et l'icône masquée aux lecteurs d'écran", () => {
    const html = renderToStaticMarkup(
      createElement(StatusChip, { tone: "success", icon: CircleCheck } as ChipProps, "En service"),
    );
    expect(html).toContain("En service");
    expect(html).toContain("bg-success-soft");
    expect(html).toContain("text-success");
    expect(html).toContain('aria-hidden="true"');
  });

  it("utilise uniquement des tokens sémantiques", () => {
    for (const classes of Object.values(statusToneClasses)) {
      expect(classes).not.toMatch(/(gray|red|green|blue|yellow|amber|icc)-/);
    }
    expect(renderToStaticMarkup(createElement(StatusChip, {} as ChipProps, "Brouillon"))).toContain("bg-surface-sunken");
  });
});

describe("buttonClasses", () => {
  it("rend les variantes héritées : edit = primary, info = secondary", () => {
    expect(variantClasses.edit).toBe(variantClasses.primary);
    expect(variantClasses.info).toBe(variantClasses.secondary);
  });

  it("repose sur les tokens : survol brand-hover (plus de jaune), focus visible, 44px en md", () => {
    const primary = buttonClasses("primary");
    expect(primary).toContain("bg-brand");
    expect(primary).toContain("hover:bg-brand-hover");
    expect(primary).not.toContain("jaune");
    expect(primary).toContain("focus-visible:outline-focus");
    expect(primary).toContain("min-h-11");
    expect(buttonClasses("secondary", "sm")).toContain("min-h-9");
    expect(buttonClasses("danger")).toContain("text-on-danger");
    for (const classes of Object.values(variantClasses)) {
      expect(classes).not.toMatch(/(gray|red|sky|icc)-/);
    }
  });
});

describe("Badge", () => {
  it("plafonne à 9+ et ne s'affiche pas à zéro", () => {
    expect(formatCount(3)).toBe("3");
    expect(formatCount(12)).toBe("9+");
    expect(renderToStaticMarkup(createElement(Badge, { count: 0 }))).toBe("");
    expect(renderToStaticMarkup(createElement(Badge, { count: 42 }))).toContain("9+");
  });
});

describe("selectionLabel", () => {
  it("accorde et accentue le décompte de sélection", () => {
    expect(selectionLabel(1)).toBe("1 élément sélectionné");
    expect(selectionLabel(3)).toBe("3 éléments sélectionnés");
  });
});

describe("isTabActive", () => {
  it("active l'onglet sur son chemin et ses sous-pages, sauf en mode exact", () => {
    expect(isTabActive({ href: "/audio/production", label: "Production" }, "/audio/production")).toBe(true);
    expect(isTabActive({ href: "/audio/production", label: "Production" }, "/audio/production/42")).toBe(true);
    expect(isTabActive({ href: "/audio/production", label: "Production" }, "/audio/production-x")).toBe(false);
    expect(isTabActive({ href: "/media", label: "Accueil", exact: true }, "/media/events")).toBe(false);
    expect(isTabActive({ href: "/media", label: "Accueil", active: true }, "/autre")).toBe(true);
    expect(isTabActive({ href: "/media", label: "Accueil" }, null)).toBe(false);
  });
});
