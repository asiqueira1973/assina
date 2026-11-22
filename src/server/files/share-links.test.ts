// Regra 11.18 (API e MCP): link de compartilhamento do Google Drive ou do Dropbox vira o download
// direto do arquivo. Achado em 22/11/2026: o link "/file/d/…/view" do Drive devolve uma página
// HTML, e o anexo era recusado como "não é PDF".
import { describe, expect, it } from "vitest";
import { directDownloadUrl } from "./share-links";

const DRIVE = "https://drive.usercontent.google.com/download?id=1tfl6ZpuVGRIDUDYSI2rNrbm-skMOD6Sx&export=download&confirm=t";

describe("link de compartilhamento → download direto", () => {
  it.each([
    "https://drive.google.com/file/d/1tfl6ZpuVGRIDUDYSI2rNrbm-skMOD6Sx/view?usp=sharing",
    "https://drive.google.com/file/d/1tfl6ZpuVGRIDUDYSI2rNrbm-skMOD6Sx/view",
    "https://drive.google.com/file/d/1tfl6ZpuVGRIDUDYSI2rNrbm-skMOD6Sx",
    "https://drive.google.com/open?id=1tfl6ZpuVGRIDUDYSI2rNrbm-skMOD6Sx",
    "https://drive.google.com/uc?id=1tfl6ZpuVGRIDUDYSI2rNrbm-skMOD6Sx&export=download",
  ])("Google Drive: %s", (url) => {
    expect(directDownloadUrl(url)).toBe(DRIVE);
  });

  it("Dropbox: dl=0 vira dl=1 (e sem dl ganha dl=1)", () => {
    expect(directDownloadUrl("https://www.dropbox.com/scl/fi/abc/Contrato.pdf?rlkey=xyz&dl=0")).toBe("https://www.dropbox.com/scl/fi/abc/Contrato.pdf?rlkey=xyz&dl=1");
    expect(directDownloadUrl("https://www.dropbox.com/s/abc/Contrato.pdf")).toBe("https://www.dropbox.com/s/abc/Contrato.pdf?dl=1");
  });

  it("outros endereços passam como vieram", () => {
    for (const url of ["https://exemplo.com.br/contrato.pdf", "https://docs.google.com/document/d/abc/edit", "não é url"]) {
      expect(directDownloadUrl(url)).toBe(url);
    }
  });
});
