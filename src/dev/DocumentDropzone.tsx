/**
 * Зона загрузки фото документа — перетащить файл или кликнуть по всей области
 * (не маленькая кнопка). Общая для AddGuestDrawer и CreateBookingButton: два
 * экземпляра рядом (по 50% ширины — лицевая/оборотная сторона ID-карты) или
 * один на всю ширину (загранпаспорт иностранца).
 *
 * Сам файл — валидация, HEIC→jpg, запуск распознавания — по-прежнему забота
 * вызывающего кода (см. handlePickPassportPhoto/handlePickBackPhoto в местах
 * использования): компонент только отдаёт File через onFile и рисует три
 * состояния — пусто, есть фото, идёт распознавание (серый оверлей + прогресс).
 */
import React from "react";
import { Box, IconButton, LinearProgress, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import UploadOutlined from "@mui/icons-material/UploadOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";

import { INVOICE_DOCUMENT_ACCEPT } from "../utility/imageCompression";

export interface DocumentDropzoneProps {
  file: File | null;
  /** Object URL превью — null у PDF (тогда показываем имя файла вместо картинки). */
  preview: string | null;
  /** Идёт распознавание — фото гасится в серый, поверх прогрессбар и подпись. */
  scanning?: boolean;
  scanProgress?: number;
  onFile: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
  label?: string;
  sx?: SxProps<Theme>;
}

const DEFAULT_LABEL = "Перетащите паспорт сюда либо нажмите и выберите нужный файл";
const ZONE_HEIGHT = 116;

export const DocumentDropzone: React.FC<DocumentDropzoneProps> = ({
  file,
  preview,
  scanning = false,
  scanProgress = 0,
  onFile,
  onRemove,
  disabled = false,
  label = DEFAULT_LABEL,
  sx,
}) => {
  const theme = useTheme();
  const [dragOver, setDragOver] = React.useState(false);

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  };

  return (
    <Box sx={{ position: "relative", height: ZONE_HEIGHT, ...sx }}>
      {!file ? (
        <Box
          component="label"
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.5,
            height: "100%",
            px: 2,
            textAlign: "center",
            borderRadius: "10px",
            border: "2px dashed",
            borderColor: dragOver ? "primary.main" : "divider",
            bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.06) : "transparent",
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.6 : 1,
            transition: "border-color .15s ease, background-color .15s ease",
          }}
        >
          <UploadOutlined fontSize="small" color={dragOver ? "primary" : "disabled"} />
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <input
            type="file"
            accept={INVOICE_DOCUMENT_ACCEPT}
            hidden
            disabled={disabled}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (picked) onFile(picked);
            }}
          />
        </Box>
      ) : (
        <Box sx={{ position: "relative", height: "100%", borderRadius: "10px", overflow: "hidden" }}>
          {preview ? (
            <Box
              component="img"
              src={preview}
              alt="Фото документа"
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                filter: scanning ? "grayscale(1)" : "none",
                transition: "filter .2s ease",
              }}
            />
          ) : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.5,
                height: "100%",
                bgcolor: theme.palette.mode === "dark" ? alpha("#fff", 0.04) : alpha("#000", 0.03),
                border: "1px solid",
                borderColor: "divider",
                px: 1,
                filter: scanning ? "grayscale(1)" : "none",
              }}
            >
              <InsertDriveFileOutlined fontSize="small" color="disabled" />
              <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: "90%" }}>
                {file.name}
              </Typography>
            </Box>
          )}

          {scanning && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                bgcolor: alpha("#000", 0.4),
              }}
            >
              <Typography variant="caption" sx={{ color: "#fff", fontWeight: 600 }}>
                Распознаём…
              </Typography>
              <LinearProgress
                variant="determinate"
                value={scanProgress}
                aria-label="Распознаём документ"
                sx={{
                  width: "70%",
                  height: 6,
                  borderRadius: 3,
                  bgcolor: alpha("#fff", 0.3),
                  "& .MuiLinearProgress-bar": { borderRadius: 3, transition: "transform .15s linear" },
                }}
              />
            </Box>
          )}

          {/* Крестик доступен и во время распознавания — вдруг пользователь передумал,
              не дожидаясь ответа; см. сброс scanGenerationRef в onRemove у вызывающего
              кода, который тогда отбрасывает уже идущее распознавание. */}
          {!disabled && (
            <IconButton
              size="small"
              onClick={onRemove}
              aria-label="Убрать файл"
              sx={{
                position: "absolute",
                top: 4,
                right: 4,
                zIndex: 1,
                bgcolor: alpha("#000", 0.45),
                color: "#fff",
                "&:hover": { bgcolor: alpha("#000", 0.65) },
              }}
            >
              <CloseOutlined fontSize="small" />
            </IconButton>
          )}
        </Box>
      )}
    </Box>
  );
};

export default DocumentDropzone;
