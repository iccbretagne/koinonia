/* eslint-disable react/no-children-prop -- createElement typé : children requis dans les props */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { rovingIndex } from "../roving";
import { buttonClasses, iconButtonClasses } from "../button-classes";
import IconButton from "../IconButton";
import { X } from "lucide-react";
import Switch from "../Switch";
import SegmentedControl from "../SegmentedControl";
import RadioGroup, { choiceCardClasses, choiceChipClasses } from "../RadioGroup";
import FileInput, { fileNamesSummary } from "../FileInput";
import Tabs, { TabPanel, tabIds } from "../Tabs";
import Menu, { menuPosition } from "../Menu";
import FilterChip from "../FilterChip";
import Select from "../Select";
import ConfirmModal from "../ConfirmModal";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("rovingIndex", () => {
  const none = [false, false, false];
  it("avance, recule et boucle", () => {
    expect(rovingIndex(0, "ArrowRight", none)).toBe(1);
    expect(rovingIndex(2, "ArrowRight", none)).toBe(0);
    expect(rovingIndex(0, "ArrowLeft", none)).toBe(2);
  });
  it("saute les éléments désactivés", () => {
    expect(rovingIndex(0, "ArrowRight", [false, true, false])).toBe(2);
    expect(rovingIndex(2, "ArrowLeft", [false, true, false])).toBe(0);
    expect(rovingIndex(1, "Home", [true, false, false])).toBe(1);
    expect(rovingIndex(0, "End", [false, false, true])).toBe(1);
  });
  it("suit l'orientation et ignore les autres touches", () => {
    expect(rovingIndex(0, "ArrowDown", none, "vertical")).toBe(1);
    expect(rovingIndex(0, "ArrowRight", none, "vertical")).toBeNull();
    expect(rovingIndex(0, "Enter", none)).toBeNull();
    expect(rovingIndex(0, "ArrowRight", [])).toBeNull();
  });
});

describe("tailles et variantes de bouton", () => {
  it("sm fait 44 px sur mobile, 36 px à partir de sm:", () => {
    expect(buttonClasses("secondary", "sm")).toContain("min-h-11 sm:min-h-9");
    expect(iconButtonClasses("sm")).toContain("size-11 sm:size-9");
  });
  it("on-brand garde un anneau de focus lisible sur fond brand", () => {
    const c = buttonClasses("on-brand");
    expect(c).toContain("outline-on-brand");
    expect(c).not.toContain("outline-focus");
    expect(buttonClasses("primary")).toContain("focus-visible:outline-focus");
  });
  it("IconButton on-dark pour les visionneuses", () => {
    const out = html(createElement(IconButton, { icon: X, "aria-label": "Fermer", variant: "on-dark" }));
    expect(out).toContain('aria-label="Fermer"');
    expect(out).toContain("text-white/80");
  });
});

describe("Switch", () => {
  it("rend un role=switch nommé, 44 px", () => {
    const out = html(createElement(Switch, { checked: true, onChange: () => {}, label: "Publier la page", hideLabel: true }));
    expect(out).toContain('role="switch"');
    expect(out).toContain('aria-checked="true"');
    expect(out).toContain('aria-label="Publier la page"');
    expect(out).toContain("min-h-11");
  });
  it("relie le libellé visible et la description", () => {
    const out = html(createElement(Switch, { checked: false, onChange: () => {}, label: "Rappels", description: "La veille", id: "s1" }));
    expect(out).toContain('<label for="s1"');
    expect(out).toContain('aria-describedby="s1-description"');
    expect(out).toContain('aria-checked="false"');
  });
});

describe("SegmentedControl", () => {
  it("groupe nommé de boutons aria-pressed", () => {
    const out = html(
      createElement(SegmentedControl, {
        label: "Affichage",
        value: "b",
        onChange: () => {},
        options: [
          { value: "a", label: "Tableau" },
          { value: "b", label: "Frise" },
        ],
      }),
    );
    expect(out).toContain('role="group"');
    expect(out).toContain('aria-label="Affichage"');
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(out).toContain("focus-visible:outline-focus");
  });
});

describe("RadioGroup", () => {
  it("fieldset + legend + radios natifs, un seul coché", () => {
    const out = html(
      createElement(RadioGroup, {
        legend: "Portée",
        name: "scope",
        value: "single",
        onChange: () => {},
        options: [
          { value: "single", label: "Cet événement" },
          { value: "future", label: "Les suivants", description: "Toute la série" },
        ],
      }),
    );
    expect(out).toContain("<fieldset");
    expect(out).toContain("<legend");
    expect(out.match(/type="radio"/g)).toHaveLength(2);
    expect(out.match(/checked=""/g)).toHaveLength(1);
    expect(out).toContain("Toute la série");
  });
  it("variante chips : pastilles de 44 px, active en brand-soft", () => {
    expect(choiceChipClasses(true)).toContain("bg-brand-soft");
    expect(choiceChipClasses(false)).toContain("border-control-line");
    expect(choiceChipClasses(true)).toContain("min-h-11");
    expect(choiceChipClasses(true)).toContain("has-[:focus-visible]:outline-focus");
  });
  it("non contrôlé : defaultChecked pour un formulaire serveur", () => {
    const out = html(createElement(RadioGroup, { legend: "Église", name: "church_id", defaultValue: "b", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }));
    expect(out).toMatch(/checked="" value="b"/);
  });
  it("variante cards en grille : rond visible, description, option désactivée, cochée en brand-soft", () => {
    const out = html(
      createElement(RadioGroup, {
        legend: "Créneau",
        variant: "cards",
        columns: 2,
        value: "a",
        onChange: () => {},
        options: [
          { value: "a", label: "10:00", description: "En visio" },
          { value: "b", label: "11:00", description: "Complet", disabled: true },
        ],
      }),
    );
    expect(out).toContain("sm:grid-cols-2");
    expect(out.match(/type="radio"/g)).toHaveLength(2);
    expect(out).toContain("accent-brand");
    expect(out).toContain("En visio");
    expect(out.match(/disabled=""/g)).toHaveLength(1);
    expect(choiceCardClasses).toContain("min-h-11");
    expect(choiceCardClasses).toContain("has-[:checked]:bg-brand-soft");
  });
  it("description de groupe sous la légende, relue par aria-describedby avec l'aide", () => {
    const out = html(
      createElement(RadioGroup, {
        legend: "Note",
        description: "De 1 à 5",
        hint: "Facultatif",
        value: "",
        onChange: () => {},
        options: [{ value: "1", label: "1" }],
      }),
    );
    const ids = /aria-describedby="([^"]+)"/.exec(out)?.[1].split(" ") ?? [];
    expect(ids).toHaveLength(2);
    expect(out).toContain(`id="${ids[0]}"`);
    expect(out.indexOf("De 1 à 5")).toBeLessThan(out.indexOf('type="radio"'));
  });
});

describe("FileInput", () => {
  it("bouton du design system autour d'un input masqué mais focalisable", () => {
    const out = html(createElement(FileInput, { label: "Justificatif", id: "f1", accept: "application/pdf", hint: "PDF" }));
    expect(out).toContain('<label for="f1"');
    expect(out).toContain('type="file"');
    expect(out).toContain('class="sr-only"');
    expect(out).toContain("Choisir un fichier");
    expect(out).toContain("has-[:focus-visible]:outline-focus");
    expect(out).toContain('aria-describedby="');
  });
  it("résume les fichiers choisis", () => {
    expect(fileNamesSummary([])).toBe("");
    expect(fileNamesSummary(["a.pdf"])).toBe("a.pdf");
    expect(fileNamesSummary(["a", "b"])).toBe("a, b");
    expect(fileNamesSummary(["a", "b", "c", "d"])).toBe("4 fichiers choisis");
  });
});

describe("Tabs pilotés par état", () => {
  it("tablist/tab reliés au panneau, un seul onglet tabulable", () => {
    const out = html(
      createElement(Tabs<"a" | "b">, {
        ariaLabel: "Vues",
        idBase: "v",
        value: "b",
        onChange: () => {},
        tabs: [
          { value: "a", label: "Liste" },
          { value: "b", label: "Statistiques" },
        ],
      }),
    );
    expect(out).toContain('role="tablist"');
    expect(out.match(/role="tab"/g)).toHaveLength(2);
    expect(out).toContain('id="v-tab-b" type="button" role="tab" aria-selected="true" aria-controls="v-panel" tabindex="0"');
    expect(out).toContain('tabindex="-1"');
    const panel = html(createElement(TabPanel, { idBase: "v", value: "b", children: "x" }));
    expect(panel).toContain('role="tabpanel"');
    expect(panel).toContain(`aria-labelledby="${tabIds("v", "b").tab}"`);
  });
  it("les onglets liens restent des liens aria-current", () => {
    const out = html(createElement(Tabs, { ariaLabel: "Espace", tabs: [{ href: "/", label: "Accueil" }] }));
    expect(out).toContain("<nav");
    expect(out).toContain('aria-current="page"');
  });
});

describe("Menu", () => {
  it("déclencheur ⋯ nommé, fermé au rendu", () => {
    const out = html(createElement(Menu, { label: "Autres actions", items: [{ label: "Relancer", onSelect: () => {} }] }));
    expect(out).toContain('aria-haspopup="menu"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('aria-label="Autres actions"');
    expect(out).not.toContain('role="menu"');
  });
  it("positionne la liste sous le déclencheur, ou au-dessus si elle déborde", () => {
    const trigger = { top: 100, bottom: 136, left: 300, right: 336 };
    expect(menuPosition(trigger, { width: 200, height: 120 }, { width: 1024, height: 768 }, "end")).toEqual({ top: 140, left: 136 });
    expect(menuPosition({ ...trigger, top: 700, bottom: 736 }, { width: 200, height: 120 }, { width: 1024, height: 768 }, "start")).toEqual({ top: 576, left: 300 });
    expect(menuPosition({ top: 0, bottom: 36, left: 0, right: 36 }, { width: 200, height: 40 }, { width: 1024, height: 768 }, "end").left).toBe(8);
  });
});

describe("FilterChip, Select et ConfirmModal", () => {
  it("FilterChip href : lien aria-current", () => {
    const out = html(createElement(FilterChip, { href: "/plateforme/assistant?status=open", pressed: true, children: "Ouvertes" }));
    expect(out).toContain('href="/plateforme/assistant?status=open"');
    expect(out).toContain('aria-current="page"');
    const btn = html(createElement(FilterChip, { pressed: false, onClick: () => {}, children: "Tous" }));
    expect(btn).toContain('aria-pressed="false"');
  });
  it("Select hideLabel garde un libellé lu", () => {
    const out = html(createElement(Select, { label: "Type", hideLabel: true, id: "t", options: [{ value: "a", label: "A" }] }));
    expect(out).toContain('class="sr-only"');
    expect(out).toContain('for="t"');
  });
  it("ConfirmModal accepte un libellé d'annulation", () => {
    const out = html(
      createElement(ConfirmModal, { open: true, title: "Annuler ?", message: "", confirmLabel: "Annuler ma réponse", cancelLabel: "Garder ma réponse", onConfirm: () => {}, onCancel: () => {} }),
    );
    expect(out).toContain("Garder ma réponse");
  });
});
