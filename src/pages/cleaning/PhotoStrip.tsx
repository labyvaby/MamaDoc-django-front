import React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import BrokenImageOutlined from "@mui/icons-material/BrokenImageOutlined";

import { subtleBg } from "../../theme/uiHelpers";
import type { CleaningPhoto } from "../../api/cleaning";

/** Ширина миниатюры по умолчанию — под строку таблицы высотой 56px. */
const DEFAULT_SIZE = 36;
/** Зазор между миниатюрами (в px), он же используется в расчёте вместимости. */
export const PHOTO_STRIP_GAP = 4;

/**
 * Сколько миниатюр влезет в ячейку заданной ширины. Считаем здесь, а не «на
 * глаз» в колонке: ширина колонки «Фото» плавающая (flex), а фотоотчёт бывает
 * и на 15 снимков — без расчёта лишние просто обрезались краем ячейки.
 */
export function fitPhotoCount(availableWidth: number, size = DEFAULT_SIZE): number {
  const usable = availableWidth - 16; // паддинги ячейки DataGrid
  return Math.max(1, Math.floor((usable + PHOTO_STRIP_GAP) / (size + PHOTO_STRIP_GAP)));
}

/** Одна миниатюра: битую ссылку показываем заглушкой, а не «сломанной» картинкой. */
const Thumb: React.FC<{
  photo: CleaningPhoto;
  size: number;
  index: number;
  onOpen: (index: number) => void;
}> = ({ photo, size, index, onOpen }) => {
  const [failed, setFailed] = React.useState(false);

  const common = {
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: "8px",
    cursor: "pointer",
    border: 1,
    borderColor: "divider",
    transition: "border-color .15s ease, opacity .15s ease",
    "&:hover": { borderColor: "primary.main", opacity: 0.85 },
  } as const;

  if (failed) {
    return (
      <Box
        onClick={() => onOpen(index)}
        sx={(t) => ({
          ...common,
          bgcolor: subtleBg(t, true),
          color: "text.disabled",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        <BrokenImageOutlined sx={{ fontSize: size * 0.5 }} />
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={photo.url}
      alt={`Фото ${index + 1}`}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      onClick={() => onOpen(index)}
      sx={{ ...common, objectFit: "cover" }}
    />
  );
};

export interface PhotoStripProps {
  photos: CleaningPhoto[];
  onOpen: (index: number) => void;
  size?: number;
  /**
   * Сколько миниатюр показать; остальные сворачиваются в «+N» — клик по нему
   * открывает просмотрщик с первого скрытого снимка. Без значения показываем
   * все (для лент со своим скроллом — например, в мобильной карточке).
   */
  maxVisible?: number;
  /** Горизонтальный скролл вместо «+N» — когда места мало, но обрезать жаль. */
  scrollable?: boolean;
}

/** Лента миниатюр фотоотчёта: в таблице сворачивается в «+N», в карточке скроллится. */
export const PhotoStrip: React.FC<PhotoStripProps> = ({
  photos,
  onOpen,
  size = DEFAULT_SIZE,
  maxVisible,
  scrollable = false,
}) => {
  if (photos.length === 0) {
    return (
      <Typography variant="caption" color="text.disabled">
        нет фото
      </Typography>
    );
  }

  // Место под «+N» занимает ту же клетку, что и миниатюра, поэтому при
  // переполнении показываем на одну картинку меньше.
  const overflow = maxVisible != null && photos.length > maxVisible;
  const shown = overflow ? photos.slice(0, Math.max(1, maxVisible - 1)) : photos;
  const hidden = photos.length - shown.length;

  return (
    <Stack
      direction="row"
      gap={`${PHOTO_STRIP_GAP}px`}
      alignItems="center"
      sx={
        scrollable
          ? {
              overflowX: "auto",
              py: 0.25,
              "&::-webkit-scrollbar": { height: 4 },
              "&::-webkit-scrollbar-thumb": { bgcolor: "action.disabled", borderRadius: 2 },
            }
          : { minWidth: 0 }
      }
    >
      {shown.map((photo, i) => (
        <Thumb key={photo.id} photo={photo} size={size} index={i} onOpen={onOpen} />
      ))}
      {overflow && (
        <Tooltip title={`Ещё ${hidden} фото`}>
          <Box
            onClick={() => onOpen(shown.length)}
            sx={(t) => ({
              width: size,
              height: size,
              flexShrink: 0,
              borderRadius: "8px",
              border: 1,
              borderColor: "divider",
              bgcolor: subtleBg(t, true),
              color: "text.secondary",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "border-color .15s ease, background-color .15s ease",
              "&:hover": {
                borderColor: "primary.main",
                bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.08),
              },
            })}
          >
            +{hidden}
          </Box>
        </Tooltip>
      )}
    </Stack>
  );
};

export default PhotoStrip;
