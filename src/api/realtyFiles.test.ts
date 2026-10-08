import { describe, expect, it } from "vitest";

import { formatFileSize, fromRawProjectMedia, fromRawUnitMedia, unitPlan, unitRenders } from "./realtyFiles";

const file = (patch: Record<string, unknown>) => ({
  id: 7,
  projectId: 1,
  layoutId: 1,
  layoutCode: "ALA-1",
  kind: "plan",
  kindLabel: "Планировка",
  title: "Планировка ALA-1",
  note: "Студия · 37.8 м²",
  fileName: "Планировка ALA-1.png",
  fileSize: 4096,
  contentType: "image/png",
  url: "https://test2.crm.operator.kg/api/v2/realty/projects/1/files/7/file/",
  sortOrder: 0,
  createdBy: null,
  createdAt: "2026-10-06T11:55:54.891756+06:00",
  ...patch,
});

describe("файлы ЖК (test2, 08.10)", () => {
  it("ЖК: обложка, фото, документы, презентация; нет файлов — null и пустые списки", () => {
    const media = fromRawProjectMedia({
      coverUrl: "https://test2.crm.operator.kg/api/v2/realty/projects/1/files/1/file/",
      facadeUrl: null,
      photos: [file({ id: 1, kind: "photo", layoutId: null })],
      documents: [file({ id: 16, kind: "document", contentType: "application/pdf" })],
      presentation: file({ id: 15, kind: "presentation" }),
    });
    expect(media.coverUrl).toContain("/files/1/file/");
    expect(media.facadeUrl).toBeNull();
    expect(media.photos[0].layoutId).toBeNull();
    expect(media.presentation?.id).toBe(15);
    expect(fromRawProjectMedia({ coverUrl: null, photos: [] })).toEqual({ coverUrl: null, facadeUrl: null, photos: [], documents: [], presentation: null });
  });

  it("квартира: план и рендеры с подписями из media[], иначе — голые ссылки", () => {
    const withMedia = fromRawUnitMedia({
      images: ["https://x/api/v2/realty/projects/1/files/7/file/"],
      renders: ["https://x/api/v2/realty/projects/1/files/3/file/"],
      media: [file({}), file({ id: 3, kind: "render", title: "Кухня-гостиная", note: "Светлая", url: "https://x/api/v2/realty/projects/1/files/3/file/" })],
    });
    expect(unitPlan(withMedia)).toMatchObject({ title: "Планировка ALA-1" });
    expect(unitRenders(withMedia)).toEqual([{ url: "https://x/api/v2/realty/projects/1/files/3/file/", title: "Кухня-гостиная", note: "Светлая" }]);

    const bare = fromRawUnitMedia({ images: ["https://x/plan"], renders: ["https://x/r1", "https://x/r2"] });
    expect(unitPlan(bare)?.url).toBe("https://x/plan");
    expect(unitRenders(bare)).toHaveLength(2);
    expect(unitPlan(fromRawUnitMedia({}))).toBeNull();
  });

  it("размер файла", () => {
    expect(formatFileSize(696)).toBe("1 КБ");
    expect(formatFileSize(1_572_864)).toBe("1,5 МБ");
  });
});
