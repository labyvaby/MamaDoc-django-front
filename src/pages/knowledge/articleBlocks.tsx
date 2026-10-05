import React from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BlockNoteSchema, defaultBlockSpecs, defaultStyleSpecs } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";

import {
  FILE_LINK_TITLE,
  PDF_LINK_TITLE,
  parseYoutubeId,
  youtubeEmbedUrl,
} from "../../api/knowledge";
import { fileCardLabel, fileCardStyles } from "./fileCard";

// ── Блоки, которых нет в BlockNote «из коробки» ──────────────────────────────
// Статья по-прежнему хранится как HTML, который бэк санитизирует по allowlist
// (см. server/apps/knowledge/sanitizers.py), поэтому каждый блок обязан
// сериализоваться во что-то, что allowlist пропускает, и уметь разобрать это
// обратно — иначе статья потеряет блок при следующем открытии.

/**
 * Файл-вложение (PDF, Word, Excel, аудио, видео…): `<p><a title="pdf|file" href>имя</a></p>`.
 * Формат, сложившийся до BlockNote: метка в `title` (PDF — "pdf", остальное —
 * "file"), имя — текст ссылки, формат — расширение в href (см. attachmentTypes.ts).
 */
const fileBlock = createReactBlockSpec(
  {
    type: "file",
    propSchema: {
      href: { default: "" },
      name: { default: "" },
      title: { default: FILE_LINK_TITLE },
    },
    content: "none",
  },
  {
    render: ({ block }) => (
      <FileCard href={block.props.href} name={block.props.name} title={block.props.title} />
    ),
    toExternalHTML: ({ block }) => (
      <p>
        <a href={block.props.href} title={block.props.title} target="_blank" rel="noopener noreferrer">
          {block.props.name || "Файл"}
        </a>
      </p>
    ),
    parse: (el) => {
      // Абзац, целиком состоящий из одной ссылки-вложения, либо сама ссылка.
      const link =
        el.tagName === "A"
          ? el
          : el.tagName === "P" &&
              el.children.length === 1 &&
              el.firstElementChild?.tagName === "A" &&
              (el.textContent ?? "").trim() === (el.firstElementChild.textContent ?? "").trim()
            ? el.firstElementChild
            : null;
      const title = link?.getAttribute("title");
      if (!link || (title !== PDF_LINK_TITLE && title !== FILE_LINK_TITLE)) return undefined;
      const href = link.getAttribute("href");
      if (!href) return undefined;
      return { href, name: (link.textContent ?? "").trim(), title };
    },
    runsBefore: ["paragraph", "default"],
  },
);

const FileCard: React.FC<{ href: string; name: string; title: string }> = ({
  href,
  name,
  title,
}) => {
  const theme = useTheme();
  return (
    <Box
      component="a"
      href={href}
      title={title}
      data-ext={fileCardLabel(title, href)}
      // В редакторе карточку выделяют, а не открывают.
      onClick={(e: React.MouseEvent) => e.preventDefault()}
      sx={{ ...fileCardStyles(theme), cursor: "default", my: 0.5 }}
    >
      {name || "Файл"}
    </Box>
  );
};

/** YouTube-эмбед: `<iframe src="…youtube-nocookie.com/embed/ID">` (его пропускает санитайзер). */
const youtubeBlock = createReactBlockSpec(
  {
    type: "youtube",
    propSchema: { src: { default: "" } },
    content: "none",
  },
  {
    render: ({ block }) => (
      <Box
        sx={{
          width: "100%",
          maxWidth: 640,
          aspectRatio: "16/9",
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: "action.hover",
        }}
      >
        <iframe
          src={block.props.src}
          title="YouTube"
          allowFullScreen
          style={{ width: "100%", height: "100%", border: 0 }}
        />
      </Box>
    ),
    toExternalHTML: ({ block }) => <iframe src={block.props.src} allowFullScreen />,
    parse: (el) => {
      // Старые статьи оборачивали iframe в <div data-youtube-video>.
      const frame = el.tagName === "IFRAME" ? el : el.querySelector(":scope > iframe");
      const id = parseYoutubeId(frame?.getAttribute("src") ?? "");
      return id ? { src: youtubeEmbedUrl(id) } : undefined;
    },
    runsBefore: ["paragraph", "default"],
  },
);

// Блоки и стили, которые санитайзер бэка не пропустит (цвета — inline style,
// toggle — <details>, файл/аудио/видео — <video>/<audio>), в редактор не берём:
// иначе они пропали бы после первого сохранения.
/* eslint-disable @typescript-eslint/no-unused-vars */
const { audio, video, file, toggleListItem, ...allowedBlocks } = defaultBlockSpecs;
const { textColor, backgroundColor, ...allowedStyles } = defaultStyleSpecs;
/* eslint-enable @typescript-eslint/no-unused-vars */

export const articleSchema = BlockNoteSchema.create({
  blockSpecs: { ...allowedBlocks, file: fileBlock(), youtube: youtubeBlock() },
  styleSpecs: allowedStyles,
});

/**
 * HTML для бэка. BlockNote разбирает HTML через DOM, и относительные адреса
 * (`/media/x.png`) превращаются в абсолютные с адресом текущей страницы — а в
 * статье они должны оставаться относительными, иначе при смене домена все
 * картинки и PDF сломаются.
 */
export const articleHtml = (
  editor: typeof articleSchema.BlockNoteEditor,
  origin: string = typeof window === "undefined" ? "" : window.location.origin,
): string => {
  const html = editor.blocksToHTMLLossy(editor.document);
  if (!origin) return html;
  return html.split(`="${origin}/`).join('="/');
};
