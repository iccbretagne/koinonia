import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChurchMark from "../ChurchMark";
import { churchLogoSources } from "@/modules/core/schemas";

describe("churchLogoSources (spec 072)", () => {
  it("null sans logo pour fond clair, même avec un logo sombre", () => {
    expect(churchLogoSources("c1", [])).toBeNull();
    expect(churchLogoSources("c1", [{ variant: "dark", version: "d" }])).toBeNull();
  });

  it("le sombre retombe sur le clair", () => {
    expect(churchLogoSources("c1", [{ variant: "light", version: "l" }])).toEqual({
      light: "/api/churches/c1/logo?variant=light&v=l",
      dark: "/api/churches/c1/logo?variant=light&v=l",
    });
  });

  it("deux versions distinctes", () => {
    const sources = churchLogoSources("c1", [
      { variant: "dark", version: "d" },
      { variant: "light", version: "l" },
    ]);
    expect(sources?.dark).toBe("/api/churches/c1/logo?variant=dark&v=d");
  });
});

describe("ChurchMark (spec 072)", () => {
  it("plumes ICC sans logo", () => {
    expect(renderToStaticMarkup(createElement(ChurchMark, { logo: null, className: "h-9" }))).toContain("/brand/icc-plumes.svg");
  });

  it("une seule image sans logo sombre", () => {
    const html = renderToStaticMarkup(createElement(ChurchMark, { logo: churchLogoSources("c1", [{ variant: "light", version: "l" }]), className: "h-9" }));
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).not.toContain("icc-plumes");
  });

  it("une image par thème avec un logo sombre", () => {
    const logo = churchLogoSources("c1", [
      { variant: "light", version: "l" },
      { variant: "dark", version: "d" },
    ]);
    const html = renderToStaticMarkup(createElement(ChurchMark, { logo, className: "h-9" }));
    expect(html).toMatch(/variant=light&amp;v=l"[^>]*dark:hidden/);
    expect(html).toMatch(/variant=dark&amp;v=d"[^>]*hidden dark:block/);
  });
});
