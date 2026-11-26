/**
 * Tests — type des fichiers de campagne par leur contenu (spec 090) : un exécutable renommé ou
 * un classeur à macros est refusé.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { CAMPAIGN_FILE_MAX_BYTES, sniffCampaignFile } from "../services/sniff";

async function zip(entries: Record<string, string>): Promise<Uint8Array> {
  const z = new JSZip();
  for (const [name, content] of Object.entries(entries)) z.file(name, content);
  return z.generateAsync({ type: "uint8array" });
}

const XLSX_ENTRIES = {
  "[Content_Types].xml": "<Types/>",
  "xl/workbook.xml": "<workbook/>",
  "xl/worksheets/sheet1.xml": "<worksheet/>",
};

const bytes = (s: string) => new TextEncoder().encode(s);

describe("sniffCampaignFile", () => {
  it("PDF", async () => {
    expect(await sniffCampaignFile(bytes("%PDF-1.7\n..."), "x.bin")).toEqual({ mime: "application/pdf", ext: "pdf" });
  });

  it("XLSX, quel que soit le nom", async () => {
    const r = await sniffCampaignFile(await zip(XLSX_ENTRIES), "export.dat");
    expect(r?.ext).toBe("xlsx");
  });

  it("XLSM (vbaProject.bin) refusé", async () => {
    const data = await zip({ ...XLSX_ENTRIES, "xl/vbaProject.bin": "macro" });
    expect(await sniffCampaignFile(data, "export.xlsx")).toBeNull();
  });

  it("zip qui n'est pas un classeur refusé", async () => {
    expect(await sniffCampaignFile(await zip({ "a.txt": "a" }), "a.xlsx")).toBeNull();
  });

  it("exécutable renommé refusé", async () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    expect(await sniffCampaignFile(exe, "export.xlsx")).toBeNull();
    expect(await sniffCampaignFile(exe, "export.csv")).toBeNull();
  });

  it("CSV UTF-8 et Windows-1252", async () => {
    expect(await sniffCampaignFile(bytes("﻿nom;âge\r\nAnaïs;30\n"), "liste.CSV")).toEqual({ mime: "text/csv", ext: "csv" });
    // « é » en Windows-1252 (0xE9) : invalide en UTF-8.
    const cp1252 = new Uint8Array([0x6e, 0x6f, 0x6d, 0x3b, 0xe9, 0x0d, 0x0a]);
    expect((await sniffCampaignFile(cp1252, "liste.csv"))?.ext).toBe("csv");
  });

  it("CSV : extension exigée, caractères de contrôle refusés", async () => {
    expect(await sniffCampaignFile(bytes("a;b\n"), "liste.txt")).toBeNull();
    expect(await sniffCampaignFile(bytes("a;b\u0007\n"), "liste.csv")).toBeNull();
    expect(await sniffCampaignFile(new Uint8Array([0x61, 0xe9, 0x01]), "liste.csv")).toBeNull();
  });

  it("vide ou trop gros refusé", async () => {
    expect(await sniffCampaignFile(new Uint8Array(0), "a.csv")).toBeNull();
    const big = new Uint8Array(CAMPAIGN_FILE_MAX_BYTES + 1);
    big.set(bytes("%PDF"));
    expect(await sniffCampaignFile(big, "a.pdf")).toBeNull();
  });
});
