import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_ACCEPT,
  attachmentKindOf,
  attachmentLabel,
  attachmentMaxMb,
  extOf,
} from "./attachmentTypes";

describe("attachmentTypes", () => {
  it("достаёт расширение из имени и URL, игнорируя query/hash", () => {
    expect(extOf("Памятка.DOCX")).toBe("docx");
    expect(extOf("https://x.kg/media/knowledge/a.mp4?v=2#t=10")).toBe("mp4");
    expect(extOf("https://x.kg/media/file")).toBe("");
    expect(extOf(".bashrc")).toBe("");
  });

  it("распознаёт разрешённые форматы", () => {
    expect(attachmentKindOf("a.pdf")).toBe("pdf");
    expect(attachmentKindOf("a.xlsx")).toBe("sheet");
    expect(attachmentKindOf("a.pptx")).toBe("slides");
    expect(attachmentKindOf("a.m4a")).toBe("audio");
    expect(attachmentKindOf("a.mp4")).toBe("video");
  });

  it("не пропускает опасные и неподдержанные форматы", () => {
    for (const name of ["x.html", "x.svg", "x.xml", "x.exe", "x.docm", "x.xlsm", "x.zip", "x.js"]) {
      expect(attachmentKindOf(name)).toBeNull();
      expect(attachmentKindOf({ name, type: "" })).toBeNull();
    }
  });

  it("у файла без расширения берёт тип из MIME", () => {
    expect(attachmentKindOf({ name: "blob", type: "audio/mpeg" })).toBe("audio");
    expect(attachmentKindOf({ name: "blob", type: "text/html" })).toBeNull();
  });

  it("метка и лимиты", () => {
    expect(attachmentLabel("/media/a.docx")).toBe("DOCX");
    expect(attachmentLabel("https://drive.example/file/123")).toBe("ФАЙЛ");
    expect(attachmentMaxMb("pdf")).toBe(25);
    expect(attachmentMaxMb("video")).toBeGreaterThan(attachmentMaxMb("audio"));
  });

  it("accept содержит и расширения, и MIME", () => {
    expect(ATTACHMENT_ACCEPT).toContain(".docx");
    expect(ATTACHMENT_ACCEPT).toContain("video/mp4");
    expect(ATTACHMENT_ACCEPT).not.toContain(".html");
  });
});
