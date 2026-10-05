import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  attachmentCategory,
  attachmentFormatLabel,
  attachmentMeta,
  attachmentRejectReason,
  fileExtension,
  formatFileSize,
} from "./attachmentFiles";
import { PHOTO_SOURCE_MAX_BYTES } from "../../utility/imageCompression";

describe("fileExtension", () => {
  it("takes the last extension in lower case, paths included", () => {
    expect(fileExtension("Скан.PDF")).toBe("pdf");
    expect(fileExtension("C:\\fakepath\\report.final.docx")).toBe("docx");
    expect(fileExtension("photos/IMG_0001.HEIC")).toBe("heic");
  });

  it("sees no extension in dotfiles and bare names", () => {
    expect(fileExtension(".bashrc")).toBe("");
    expect(fileExtension("README")).toBe("");
  });
});

describe("attachmentCategory", () => {
  it("groups formats the way the list shows them", () => {
    expect(attachmentCategory("scan.pdf")).toBe("pdf");
    expect(attachmentCategory("photo.jpeg")).toBe("image");
    expect(attachmentCategory("letter.rtf")).toBe("word");
    expect(attachmentCategory("prices.csv")).toBe("sheet");
    expect(attachmentCategory("talk.pptx")).toBe("slides");
    expect(attachmentCategory("notes.txt")).toBe("text");
    expect(attachmentCategory("setup.exe")).toBe("other");
  });

  it("matches the accept list of the file input", () => {
    expect(ATTACHMENT_ACCEPT.split(",")).toContain(".docx");
    expect(ATTACHMENT_ACCEPT.split(",")).not.toContain(".exe");
  });
});

describe("attachmentFormatLabel", () => {
  it("shows the extension, or a neutral word without one", () => {
    expect(attachmentFormatLabel("scan.pdf")).toBe("PDF");
    expect(attachmentFormatLabel("README")).toBe("Файл");
  });
});

describe("formatFileSize", () => {
  it("uses Russian units and one decimal below ten", () => {
    expect(formatFileSize(0)).toBe("0 Б");
    expect(formatFileSize(820)).toBe("820 Б");
    expect(formatFileSize(1536)).toBe("1,5 КБ");
    expect(formatFileSize(12 * 1024 * 1024)).toBe("12 МБ");
  });
});

describe("attachmentRejectReason", () => {
  it("lets a supported file through", () => {
    expect(attachmentRejectReason({ name: "scan.pdf", size: 1024 })).toBeNull();
  });

  it("names the file and the reason", () => {
    expect(attachmentRejectReason({ name: "setup.exe", size: 10 })).toContain("формат");
    expect(attachmentRejectReason({ name: "empty.pdf", size: 0 })).toContain("пустой");
    expect(attachmentRejectReason({ name: "big.pdf", size: ATTACHMENT_MAX_BYTES + 1 })).toContain("20 МБ");
  });

  it("allows a heavier photo, which is compressed before upload", () => {
    expect(attachmentRejectReason({ name: "photo.jpg", size: ATTACHMENT_MAX_BYTES + 1 })).toBeNull();
    expect(attachmentRejectReason({ name: "photo.jpg", size: PHOTO_SOURCE_MAX_BYTES + 1 })).not.toBeNull();
  });
});

describe("attachmentMeta", () => {
  it("joins format, size, date and uploader, skipping the unknown", () => {
    const base = { name: "scan.pdf", sizeBytes: 1536, createdAt: "2026-10-05T14:30:00" };
    expect(attachmentMeta({ ...base, uploadedByName: "Айгуль" })).toBe("PDF · 1,5 КБ · 05.10.2026, 14:30 · Айгуль");
    expect(attachmentMeta({ ...base, uploadedByName: null })).toBe("PDF · 1,5 КБ · 05.10.2026, 14:30");
  });
});
