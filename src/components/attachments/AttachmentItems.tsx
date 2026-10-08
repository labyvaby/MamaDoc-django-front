/**
 * AttachmentItems.tsx — плитка фото, строка документа и строка загрузки для
 * панели файлов карточки (CardAttachmentsPanel).
 *
 * Оформление по docs/ui-style-guide.md: плоские плитки на хайрлайн-границе,
 * радиус 10px, цвета только из темы. Действия плитки на устройствах с мышью
 * появляются по наведению, на сенсорных видны всегда — навести там нечем.
 */
import React from "react";
import { Box, ButtonBase, IconButton, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import ArticleOutlined from "@mui/icons-material/ArticleOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";
import PictureAsPdfOutlined from "@mui/icons-material/PictureAsPdfOutlined";
import ReplayOutlined from "@mui/icons-material/ReplayOutlined";
import SlideshowOutlined from "@mui/icons-material/SlideshowOutlined";
import TableChartOutlined from "@mui/icons-material/TableChartOutlined";

import { attachmentSrc, type CardAttachment } from "../../api/attachments";
import { subtleBg } from "../../theme/uiHelpers";
import { attachmentCategory, attachmentMeta, type AttachmentCategory } from "./attachmentFiles";

type Tone = "primary" | "error" | "info" | "success" | "warning";

const CATEGORY_LOOK: Record<AttachmentCategory, { icon: React.ElementType; tone: Tone }> = {
  pdf: { icon: PictureAsPdfOutlined, tone: "error" },
  word: { icon: DescriptionOutlined, tone: "info" },
  text: { icon: ArticleOutlined, tone: "info" },
  sheet: { icon: TableChartOutlined, tone: "success" },
  slides: { icon: SlideshowOutlined, tone: "warning" },
  image: { icon: ImageOutlined, tone: "primary" },
  other: { icon: InsertDriveFileOutlined, tone: "primary" },
};

const rowSx = (t: Theme) => ({
  display: "flex",
  alignItems: "center",
  gap: 1.5,
  p: 1.25,
  borderRadius: "10px",
  border: 1,
  borderColor: "divider",
  bgcolor: subtleBg(t),
  transition: "background-color .15s ease, border-color .15s ease",
});

/** Плашка формата: значок и тон по типу файла. */
export const FileTypeBadge: React.FC<{ name: string }> = ({ name }) => {
  const { icon: Icon, tone } = CATEGORY_LOOK[attachmentCategory(name)];
  return (
    <Box
      sx={(t) => ({
        width: 40,
        height: 40,
        flexShrink: 0,
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: tone === "primary" ? "primary.onSurface" : `${tone}.main`,
        bgcolor: alpha(t.palette[tone].main, t.palette.mode === "dark" ? 0.18 : 0.1),
        "& .MuiSvgIcon-root": { fontSize: 20 },
      })}
    >
      <Icon />
    </Box>
  );
};

type PhotoTileProps = {
  attachment: CardAttachment;
  onOpen: () => void;
  /** Меню действий; без него плитка только открывается. */
  onMenu?: (anchor: HTMLElement) => void;
};

export const PhotoTile: React.FC<PhotoTileProps> = ({ attachment, onOpen, onMenu }) => (
  <Box
    sx={(t) => ({
      position: "relative",
      aspectRatio: "1 / 1",
      borderRadius: "10px",
      overflow: "hidden",
      border: 1,
      borderColor: "divider",
      bgcolor: subtleBg(t),
      transition: "border-color .15s ease",
      "&:hover": { borderColor: alpha(t.palette.primary.main, 0.35) },
      "&:hover img": { transform: "scale(1.04)" },
      "&:hover .attachment-tile-reveal, &:focus-within .attachment-tile-reveal": { opacity: 1 },
    })}
  >
    <ButtonBase
      onClick={onOpen}
      aria-label={`Открыть фото «${attachment.name}»`}
      sx={{ position: "absolute", inset: 0, cursor: "zoom-in" }}
    >
      <Box
        component="img"
        src={attachmentSrc(attachment.thumbnailUrl ?? attachment.url)}
        alt={attachment.name}
        loading="lazy"
        draggable={false}
        sx={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          transition: "transform .25s ease",
        }}
      />
    </ButtonBase>
    {/* Имя — по наведению: сетка фото без подписей читается спокойнее. */}
    <Box
      className="attachment-tile-reveal"
      sx={(t) => ({
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        px: 1,
        pt: 2.5,
        pb: 0.75,
        pointerEvents: "none",
        color: t.palette.common.white,
        background: `linear-gradient(to top, ${alpha(t.palette.common.black, 0.6)}, transparent)`,
        opacity: 0,
        transition: "opacity .15s ease",
        "@media (hover: none)": { display: "none" },
      })}
    >
      <Typography variant="caption" noWrap component="div" sx={{ fontWeight: 500 }}>
        {attachment.name}
      </Typography>
    </Box>
    {onMenu && (
      <IconButton
        className="attachment-tile-reveal"
        size="small"
        aria-label={`Действия с фото «${attachment.name}»`}
        onClick={(event) => onMenu(event.currentTarget)}
        sx={(t) => ({
          position: "absolute",
          top: 6,
          right: 6,
          width: 30,
          height: 30,
          borderRadius: "10px",
          color: "text.primary",
          bgcolor: alpha(t.palette.background.paper, 0.88),
          "&:hover": { bgcolor: t.palette.background.paper },
          transition: "opacity .15s ease",
          "@media (hover: hover)": { opacity: 0 },
        })}
      >
        <MoreVertOutlined sx={{ fontSize: 18 }} />
      </IconButton>
    )}
  </Box>
);

type DocumentRowProps = {
  attachment: CardAttachment;
  /** Открыть: PDF — во вьювере, остальное — скачать. */
  onOpen: () => void;
  onMenu?: (anchor: HTMLElement) => void;
  /** На телефоне скачивание уезжает в меню — строке нужна ширина под имя. */
  showDownload: boolean;
};

export const DocumentRow: React.FC<DocumentRowProps> = ({ attachment, onOpen, onMenu, showDownload }) => (
  <Box
    sx={(t) => ({
      ...rowSx(t),
      "&:hover": { bgcolor: subtleBg(t, true), borderColor: alpha(t.palette.primary.main, 0.28) },
    })}
  >
    <ButtonBase
      onClick={onOpen}
      aria-label={`Открыть «${attachment.name}»`}
      sx={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "flex-start", gap: 1.5, borderRadius: "10px", textAlign: "left" }}
    >
      <FileTypeBadge name={attachment.name} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap title={attachment.name}>
          {attachment.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {attachmentMeta(attachment)}
        </Typography>
      </Box>
    </ButtonBase>
    <Stack direction="row" alignItems="center" gap={0.25} sx={{ flexShrink: 0 }}>
      {showDownload && (
        <Tooltip title="Скачать">
          <IconButton
            size="small"
            component="a"
            href={attachmentSrc(attachment.downloadUrl)}
            download={attachment.name}
            aria-label={`Скачать «${attachment.name}»`}
            sx={{ borderRadius: "10px" }}
          >
            <DownloadOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {onMenu && (
        <IconButton
          size="small"
          aria-label={`Действия с файлом «${attachment.name}»`}
          onClick={(event) => onMenu(event.currentTarget)}
          sx={{ borderRadius: "10px" }}
        >
          <MoreVertOutlined fontSize="small" />
        </IconButton>
      )}
    </Stack>
  </Box>
);

type PendingRowProps = {
  name: string;
  error: string | null;
  onRetry: () => void;
  onDismiss: () => void;
};

/** Файл в пути: идёт загрузка или она не удалась (с причиной и повтором). */
export const PendingRow: React.FC<PendingRowProps> = ({ name, error, onRetry, onDismiss }) => (
  <Box
    sx={(t) => ({
      ...rowSx(t),
      ...(error ? { borderColor: alpha(t.palette.error.main, 0.45) } : {}),
    })}
  >
    <FileTypeBadge name={name} />
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="body2" fontWeight={600} noWrap title={name}>
        {name}
      </Typography>
      {error ? (
        <Typography variant="caption" color="error" component="div" sx={{ whiteSpace: "pre-line" }}>
          {error}
        </Typography>
      ) : (
        <LinearProgress aria-label={`Загружается «${name}»`} sx={{ mt: 0.75, height: 4, borderRadius: "4px" }} />
      )}
    </Box>
    {error && (
      <Stack direction="row" gap={0.25} sx={{ flexShrink: 0 }}>
        <Tooltip title="Повторить">
          <IconButton size="small" onClick={onRetry} aria-label={`Повторить загрузку «${name}»`} sx={{ borderRadius: "10px" }}>
            <ReplayOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Убрать">
          <IconButton size="small" onClick={onDismiss} aria-label={`Убрать «${name}»`} sx={{ borderRadius: "10px" }}>
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    )}
  </Box>
);
