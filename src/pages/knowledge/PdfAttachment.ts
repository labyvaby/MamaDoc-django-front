import { Node, mergeAttributes } from "@tiptap/react";

import { PDF_LINK_TITLE } from "../../api/knowledge";

/**
 * Вложенный PDF в статье базы знаний.
 *
 * Хранится не отдельной сущностью, а обычной ссылкой с меткой `title="pdf"` —
 * единственная форма, которую пропускает санитайзер бэка (`<iframe>` с
 * не-YouTube src он вырезает целиком, `data-*` и `download` тоже, см.
 * api/knowledge.ts). Поэтому имя файла хранится текстом ссылки, а не атрибутом.
 *
 * Нод — строчный атом: внутрь него нельзя поставить курсор и что-то дописать,
 * клик выделяет карточку целиком (переименовывать файл в тексте статьи незачем —
 * подпись задаётся в диалоге вставки). Строчный, а не блочный, потому что бэк
 * возвращает вложение внутри абзаца (`<p><a title="pdf">…</a></p>`) — блочный
 * нод в такой структуре не разбирался и рассыпался на ссылку + пустую карточку.
 * Внешний вид — CSS по селектору `a[title="pdf"]` в редакторе и на странице
 * статьи (карточка — inline-flex, поэтому стоит отдельной строкой).
 */
export const PdfAttachment = Node.create({
  name: "pdfAttachment",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element) => element.getAttribute("href"),
      },
      name: {
        default: "",
        parseHTML: (element) => (element.textContent ?? "").trim(),
        // В HTML не попадает: имя — текст ссылки, а лишний атрибут `name`
        // санитайзер бэка всё равно вырежет.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `a[title="${PDF_LINK_TITLE}"]`,
        // Приоритет правила (не расширения!) — выше дефолтных 50: правила
        // марков ProseMirror собирает раньше правил нодов, поэтому с равным
        // приоритетом ссылку разбирал марк Link, и вложение превращалось в
        // обычную ссылку в абзаце — с редактируемым текстом и кнопкой «Убрать
        // ссылку», которая молча ломала бы карточку. `priority` расширения на
        // разбор HTML не влияет — только на порядок загрузки.
        priority: 60,
        // Ссылка без href — не вложение (бэк такого не отдаёт, но content
        // редактируется руками и приходит из черновика localStorage).
        getAttrs: (element) =>
          (element as HTMLElement).getAttribute("href") ? null : false,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        title: PDF_LINK_TITLE,
        target: "_blank",
        rel: "noopener noreferrer",
      }),
      String(node.attrs.name || "Файл PDF"),
    ];
  },
});

export default PdfAttachment;
