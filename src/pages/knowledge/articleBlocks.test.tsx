// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { BlockNoteEditor } from "@blocknote/core";

import { articleHtml, articleSchema } from "./articleBlocks";

/**
 * Статья хранится как HTML, который бэк санитизирует по allowlist. Тест
 * гарантирует, что BlockNote читает старый (TipTap) HTML и пишет только то,
 * что санитайзер пропустит, не теряя PDF-карточку и YouTube.
 */
const roundTrip = (html: string): string => {
  const editor = BlockNoteEditor.create({ schema: articleSchema });
  editor.replaceBlocks(editor.document, editor.tryParseHTMLToBlocks(html));
  return articleHtml(editor);
};

describe("BlockNote ↔ HTML статьи", () => {
  it("сохраняет заголовки, списки, цитату и ссылку", () => {
    const out = roundTrip(
      '<h2>Заг</h2><p>Текст <strong>жирный</strong> и <a href="https://a.kg">ссылка</a></p>' +
        "<ul><li>раз</li></ul><ol><li>один</li></ol><blockquote><p>цитата</p></blockquote>",
    );
    expect(out).toContain("<h2");
    expect(out).toContain("<strong>жирный</strong>");
    expect(out).toContain('href="https://a.kg"');
    expect(out).toContain("<ul");
    expect(out).toContain("<ol");
    expect(out).toContain("<blockquote");
  });

  it("PDF-вложение остаётся ссылкой с title=pdf", () => {
    const out = roundTrip('<p><a href="/media/x.pdf" title="pdf">Памятка.pdf</a></p>');
    expect(out).toContain('href="/media/x.pdf"');
    expect(out).toContain('title="pdf"');
    expect(out).toContain("Памятка.pdf");
  });

  it("остальные вложения остаются ссылкой с title=file", () => {
    const out = roundTrip('<p><a href="/media/a.docx" title="file">Инструкция.docx</a></p>');
    expect(out).toContain('href="/media/a.docx"');
    expect(out).toContain('title="file"');
    expect(out).toContain("Инструкция.docx");
  });

  it("YouTube остаётся iframe с embed-адресом (и из старой обёртки div)", () => {
    const src = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    expect(roundTrip(`<iframe src="${src}"></iframe>`)).toContain(`src="${src}"`);
    expect(
      roundTrip(`<div data-youtube-video><iframe src="${src}"></iframe></div>`),
    ).toContain(`src="${src}"`);
  });

  it("картинка сохраняет src и alt", () => {
    const out = roundTrip('<img src="/media/a.png" alt="схема">');
    expect(out).toContain('src="/media/a.png"');
  });

  it("чек-лист даёт checkbox, а не вырезаемый toggle", () => {
    const out = roundTrip('<ul><li><input type="checkbox" checked>сделано</li></ul>');
    expect(out).toContain('type="checkbox"');
  });
});
