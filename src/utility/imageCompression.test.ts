import { describe, expect, it } from "vitest";
import { prepareImageForUpload, sniffImageFormat } from "./imageCompression";

const bytes = (...parts: (number[] | string)[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

/** Сегмент JPEG: маркер + длина (включая сами 2 байта длины) + данные. */
const segment = (marker: number, data: number[] | string) => {
  const payload = typeof data === "string" ? [...data].map((c) => c.charCodeAt(0)) : data;
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...payload];
};

const SOI = [0xff, 0xd8];
const SOS = [0xff, 0xda, 0x00, 0x02];
const plainJpeg = bytes(SOI, segment(0xe0, "JFIF\0"), SOS, [1, 2, 3]);
// Так выглядит HDR-снимок iPhone: EXIF, затем APP2 с MPF.
const iphoneMpo = bytes(SOI, segment(0xe1, "Exif\0\0"), segment(0xe2, "MPF\0II*\0"), SOS, [1, 2, 3]);
const heic = bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0], "mif1heic");

describe("sniffImageFormat", () => {
  it("различает обычный JPEG и многокадровый (MPO)", () => {
    expect(sniffImageFormat(plainJpeg)).toBe("jpeg");
    expect(sniffImageFormat(iphoneMpo)).toBe("mpo");
  });

  it("MPF после начала кадра не считается", () => {
    expect(sniffImageFormat(bytes(SOI, SOS, segment(0xe2, "MPF\0")))).toBe("jpeg");
  });

  it("png, webp, heic, мусор", () => {
    expect(sniffImageFormat(bytes([0x89], "PNG\r\n", [0x1a, 0x0a]))).toBe("png");
    expect(sniffImageFormat(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("webp");
    expect(sniffImageFormat(heic)).toBe("heif");
    expect(sniffImageFormat(bytes("hello world!"))).toBe("unknown");
  });
});

describe("prepareImageForUpload", () => {
  it("обычный лёгкий jpg уходит как есть", async () => {
    const file = new File([plainJpeg], "IMG_0001.jpg", { type: "image/jpeg" });
    expect(await prepareImageForUpload(file)).toBe(file);
  });

  // В node нет FileReader/Image — декодирование падает, как у браузера,
  // который снимок не понял; проверяем, что исходник не уходит вслепую.
  it("MPO с расширением .jpg как есть не отправляется", async () => {
    const file = new File([iphoneMpo], "image.jpg", { type: "image/jpeg" });
    expect(await prepareImageForUpload(file)).toBeNull();
  });

  it("HEIC под именем .jpeg уходит исходником с расширением .heic", async () => {
    const file = new File([heic], "image.jpeg", { type: "image/jpeg" });
    const prepared = await prepareImageForUpload(file);
    expect(prepared?.name).toBe("image.heic");
    expect(prepared?.type).toBe("image/heic");
  });
});
