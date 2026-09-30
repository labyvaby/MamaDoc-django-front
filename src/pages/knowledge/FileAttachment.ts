import { Node, mergeAttributes } from "@tiptap/react";

import { FILE_LINK_TITLE, PDF_LINK_TITLE } from "../../api/knowledge";
import { fileCardLabel } from "./fileCard";

/**
 * Вложенный файл в статье базы знаний (PDF, Word, Excel, аудио, видео…).
 *
 * Хранится не отдельной сущностью, а обычной ссылкой с меткой в `title`:
 * `title="pdf"` у PDF (так хранятся уже опубликованные статьи) и
 * `title="file"` у остальных форматов. Это единственная форма, которую
 * пропускает санитайзер бэка (`<iframe>` с не-YouTube src он вырезает целиком,
 * `data-*` и `download` тоже, см. api/knowledge.ts). Поэтому имя файла хранится
 * текстом ссылки, а формат — расширением в href.
 *
 * Нод — строчный атом: внутрь него нельзя поставить курсор и что-то дописать,
 * клик выделяет карточку целиком (переименовывать файл в тексте статьи незачем —
 * подпись задаётся в диалоге вставки). Строчный, а не блочный, потому что бэк
 * возвращает вложение внутри абзаца (`<p><a title="pdf">…</a></p>`) — блочный
 * нод в такой структуре не разбирался и рассыпался на ссылку + пустую карточку.
 * Внешний вид — CSS по селектору ссылки с меткой в редакторе и на странице
 * статьи (см. fileCard.ts); метку формата несёт `data-ext`, который существует
 * только в DOM — при сохранении бэк его вырежет, и это нормально.
 */
export const FileAttachment = Node.create({
  name: "fileAttachment",
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
      /** Метка ссылки: "pdf" или "file" — переживает пересохранение статьи. */
      title: {
        default: FILE_LINK_TITLE,
        parseHTML: (element) => element.getAttribute("title"),
      },
    };
  },

  parseHTML() {
    return [PDF_LINK_TITLE, FILE_LINK_TITLE].map((title) => ({
      tag: `a[title="${title}"]`,
      // Приоритет правила (не расширения!) — выше дефолтных 50: правила
      // марков ProseMirror собирает раньше правил нодов, поэтому с равным
      // приоритетом ссылку разбирал марк Link, и вложение превращалось в
      // обычную ссылку в абзаце — с редактируемым текстом и кнопкой «Убрать
      // ссылку», которая молча ломала бы карточку. `priority` расширения на
      // разбор HTML не влияет — только на порядок загрузки.
      priority: 60,
      // Ссылка без href — не вложение (бэк такого не отдаёт, но content
      // редактируется руками и приходит из черновика localStorage).
      getAttrs: (element: HTMLElement | string) =>
        (element as HTMLElement).getAttribute("href") ? null : false,
    }));
  },

  renderHTML({ node, HTMLAttributes }) {
    const href = String(node.attrs.href ?? "");
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        target: "_blank",
        rel: "noopener noreferrer",
        "data-ext": fileCardLabel(node.attrs.title, href),
      }),
      String(node.attrs.name || "Файл"),
    ];
  },
});

export default FileAttachment;
