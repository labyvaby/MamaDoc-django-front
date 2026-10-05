import React from "react";
import { Box } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { filterSuggestionItems } from "@blocknote/core";
import { ru } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import { getErrorMessage } from "../../api/client";
import { compressImage } from "../../utility/imageCompression";
import { uploadKnowledgeImage } from "../../api/knowledge";
import { attachmentKindOf } from "./attachmentTypes";
import { articleHtml, articleSchema } from "./articleBlocks";

type ArticleEditor = typeof articleSchema.BlockNoteEditor;

/** Пустой документ BlockNote — один пустой абзац без вложенных блоков. */
const isEmptyDocument = (editor: ArticleEditor): boolean => {
  const blocks = editor.document;
  if (blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const [b] = blocks;
  return (
    b.type === "paragraph" &&
    b.children.length === 0 &&
    (!Array.isArray(b.content) || b.content.length === 0)
  );
};

export interface ArticleBlockEditorHandle {
  /** HTML для бэка ('' для пустого документа). */
  getHTML: () => string;
  isEmpty: () => boolean;
  insertYoutube: (src: string) => void;
  insertFile: (href: string, name: string, title: string) => void;
  focus: () => void;
}

interface Props {
  /** Стартовый HTML; смена `resetKey` пересоздаёт редактор с новым значением. */
  initialHtml: string;
  organizationId?: number;
  disabled?: boolean;
  /** Пользователь изменил текст (не срабатывает на загрузку initialHtml). */
  onChange: () => void;
  /** Вставка/перетаскивание файла-вложения — картинки BlockNote обрабатывает сам. */
  onFile: (file: File) => void;
  /** Слэш-меню: вызвать диалоги вставки, живущие в дровере. */
  onRequestVideo: () => void;
  onRequestFile: () => void;
  onUploadError: (message: string) => void;
}

/** Файл-вложение: не картинка, а формат из реестра attachmentTypes. */
const isAttachmentFile = (file: File): boolean =>
  !file.type.startsWith("image/") && attachmentKindOf(file) !== null;

const ArticleBlockEditor = React.forwardRef<ArticleBlockEditorHandle, Props>(
  (
    {
      initialHtml,
      organizationId,
      disabled,
      onChange,
      onFile,
      onRequestVideo,
      onRequestFile,
      onUploadError,
    },
    ref,
  ) => {
    const theme = useTheme();

    // Колбэк читаем через ref: pasteHandler создаётся вместе с редактором.
    const onFileRef = React.useRef(onFile);
    onFileRef.current = onFile;

    const editor = useCreateBlockNote(
      {
        schema: articleSchema,
        dictionary: ru,
        // Документированный способ перехватить вставку: файлы-вложения грузим
        // сами (штатный блок «файл» в схеме убран), остальное — вставка BlockNote.
        pasteHandler: ({ event, defaultPasteHandler }) => {
          const attachment = Array.from(event.clipboardData?.files ?? []).find(isAttachmentFile);
          if (!attachment) return defaultPasteHandler();
          onFileRef.current(attachment);
          return true;
        },
        uploadFile: async (file: File) => {
          try {
            const compressed = await compressImage(file);
            const outFile =
              compressed instanceof File
                ? compressed
                : new File([compressed], file.name, { type: "image/jpeg" });
            return (await uploadKnowledgeImage(outFile, organizationId)).url;
          } catch (err) {
            onUploadError(getErrorMessage(err));
            throw err;
          }
        },
      },
      [organizationId],
    );

    // Загрузка стартового HTML. До её окончания onChange глушим — иначе сам
    // setContent помечал бы только что открытую статью как «изменённую».
    const loadedRef = React.useRef(false);
    React.useEffect(() => {
      loadedRef.current = false;
      const blocks = initialHtml.trim() ? editor.tryParseHTMLToBlocks(initialHtml) : [];
      if (blocks.length) editor.replaceBlocks(editor.document, blocks);
      // Снимаем глушилку после того, как отработают транзакции replaceBlocks.
      const t = setTimeout(() => {
        loadedRef.current = true;
      }, 0);
      return () => clearTimeout(t);
    }, [editor, initialHtml]);

    React.useImperativeHandle(
      ref,
      () => ({
        getHTML: () => (isEmptyDocument(editor) ? "" : articleHtml(editor)),
        isEmpty: () => isEmptyDocument(editor),
        insertYoutube: (src) => {
          const ref = editor.getTextCursorPosition().block;
          editor.insertBlocks([{ type: "youtube", props: { src } }], ref, "after");
        },
        insertFile: (href, name, title) => {
          const ref = editor.getTextCursorPosition().block;
          editor.insertBlocks([{ type: "file", props: { href, name, title } }], ref, "after");
        },
        focus: () => editor.focus(),
      }),
      [editor],
    );

    const slashItems = React.useCallback(
      async (query: string) => {
        const custom = [
          {
            title: "Видео YouTube",
            aliases: ["youtube", "video", "видео", "ютуб"],
            group: "Вложения",
            subtext: "Вставить видео по ссылке",
            onItemClick: onRequestVideo,
          },
          {
            title: "Файл",
            aliases: ["pdf", "file", "файл", "документ", "word", "excel", "аудио", "audio"],
            group: "Вложения",
            subtext: "PDF, Word, Excel, аудио, видео — файлом или ссылкой",
            onItemClick: onRequestFile,
          },
        ];
        return filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), ...custom], query);
      },
      [editor, onRequestVideo, onRequestFile],
    );

    // У BlockNote нет документированного хука на drop файлов — файл-вложение,
    // брошенный на редактор, перехватываем до него (иначе он вставится как
    // неизвестный файл).
    const interceptFileDrop = (event: React.DragEvent) => {
      const attachment = Array.from(event.dataTransfer?.files ?? []).find(isAttachmentFile);
      if (!attachment) return;
      event.preventDefault();
      event.stopPropagation();
      onFile(attachment);
    };

    return (
      <Box
        onDropCapture={interceptFileDrop}
        sx={{
          minHeight: 280,
          "& .bn-editor": { padding: theme.spacing(1, 1) },
          "& .bn-container[data-color-scheme]": { "--bn-colors-editor-background": "transparent" },
          "& .bn-block-content a": { color: theme.palette.primary.main },
          "& pre": { background: alpha(theme.palette.text.primary, 0.06) },
        }}
      >
        <BlockNoteView
          editor={editor}
          theme={theme.palette.mode === "dark" ? "dark" : "light"}
          editable={!disabled}
          slashMenu={false}
          onChange={() => {
            if (loadedRef.current) onChange();
          }}
        >
          <SuggestionMenuController triggerCharacter="/" getItems={slashItems} />
        </BlockNoteView>
      </Box>
    );
  },
);
ArticleBlockEditor.displayName = "ArticleBlockEditor";

export default ArticleBlockEditor;
