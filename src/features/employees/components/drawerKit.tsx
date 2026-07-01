import React from "react";
import { Box, Stack, Typography, IconButton } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import QrCode2Outlined from "@mui/icons-material/QrCode2Outlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import { UserAvatar } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";

/** Заголовок секции дравера: акцентная полоса + подпись + тонкая линия + опц. трейлинг. */
export const SectionLabel: React.FC<{ title: string; trailing?: React.ReactNode }> = ({
  title,
  trailing,
}) => (
  <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 0.5 }}>
    <Box sx={{ width: 3, height: 14, borderRadius: 3, bgcolor: "primary.main" }} />
    <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ fontSize: "0.75rem" }}>
      {title}
    </Typography>
    <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
    {trailing}
  </Stack>
);

/** Поле формы: подпись (+ опц. «*») над контролом, опц. подсказка снизу. */
export const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, required, hint, children }) => (
  <Stack spacing={0.5}>
    <Typography variant="body2" color="text.secondary" fontWeight={600}>
      {label}
      {required ? " *" : ""}
    </Typography>
    {children}
    {hint && (
      <Typography variant="caption" color="text.secondary">
        {hint}
      </Typography>
    )}
  </Stack>
);

/** Сетка полей: 1 колонка на узких экранах, 2 — от sm. */
export const Grid2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
    {children}
  </Box>
);

/** Сегмент-переключатель для маленьких фиксированных наборов (статус, тип). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Box
      sx={(t) => ({
        display: "flex",
        gap: 0.5,
        p: 0.5,
        border: 1,
        borderColor: "divider",
        borderRadius: "10px",
        bgcolor: subtleBg(t),
        opacity: disabled ? 0.6 : 1,
        pointerEvents: disabled ? "none" : "auto",
      })}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Box
            key={o.value}
            role="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            sx={{
              flex: 1,
              textAlign: "center",
              py: 0.85,
              px: 0.5,
              borderRadius: "7px",
              fontSize: "0.8rem",
              fontWeight: selected ? 600 : 500,
              cursor: "pointer",
              userSelect: "none",
              color: selected ? "primary.contrastText" : "text.secondary",
              bgcolor: selected ? "primary.main" : "transparent",
              transition: "background-color .15s ease, color .15s ease",
              "&:hover": { color: selected ? "primary.contrastText" : "text.primary" },
            }}
          >
            {o.label}
          </Box>
        );
      })}
    </Box>
  );
}

/** Фото-герой: кликабельный аватар с камера-бейджем + слот для ФИО/псевдонима справа.
 *  Опциональный `footer` рендерится во всю ширину под строкой (в том же блоке). */
export const PhotoHero: React.FC<{
  photoPreview: string | null;
  name?: string;
  inputId: string;
  onPickPhoto: (file: File | null) => void;
  disabled?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ photoPreview, name, inputId, onPickPhoto, disabled, children, footer }) => (
  <Stack
    spacing={2}
    sx={(t) => ({ p: 2, border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: subtleBg(t) })}
  >
   <Stack direction="row" spacing={2} alignItems="center">
    <Box sx={{ position: "relative", flexShrink: 0 }}>
      <Box
        component="label"
        htmlFor={inputId}
        sx={{ display: "block", cursor: disabled ? "default" : "pointer", lineHeight: 0 }}
      >
        <UserAvatar src={photoPreview} name={name} size={72} sx={{ borderRadius: "18px" }} />
        <Box
          sx={(t) => ({
            position: "absolute",
            right: -4,
            bottom: -4,
            width: 26,
            height: 26,
            borderRadius: "8px",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `2px solid ${t.palette.background.paper}`,
            "& .MuiSvgIcon-root": { fontSize: 14 },
          })}
        >
          <PhotoCameraOutlined />
        </Box>
      </Box>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        disabled={disabled}
        onChange={(e) => onPickPhoto(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
      />
    </Box>
    <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
      {children}
    </Stack>
   </Stack>
   {footer}
  </Stack>
);

/** Загрузчик elQR: превью QR (или пунктирная зона), замена и удаление. */
export const ElqrUploader: React.FC<{
  /** Превью: data-URL только что выбранного файла или URL уже сохранённого. */
  previewUrl: string | null;
  /** Есть ли изображение для показа (картинка). PDF показываем как иконку-файл. */
  isImage?: boolean;
  fileName?: string | null;
  inputId: string;
  onPick: (file: File | null) => void;
  onRemove?: () => void;
  disabled?: boolean;
}> = ({ previewUrl, isImage = true, fileName, inputId, onPick, onRemove, disabled }) => {
  const has = Boolean(previewUrl || fileName);
  return (
    <Box
      component="label"
      htmlFor={inputId}
      sx={(t) => ({
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1.5,
        borderRadius: "10px",
        border: has ? 1 : "1.5px dashed",
        borderColor: has ? "divider" : alpha(t.palette.primary.main, 0.4),
        bgcolor: subtleBg(t),
        cursor: disabled ? "default" : "pointer",
        transition: "border-color .15s ease, background-color .15s ease",
        "&:hover": disabled ? undefined : { borderColor: alpha(t.palette.primary.main, 0.6) },
      })}
    >
      <Box
        sx={(t) => ({
          width: 44,
          height: 44,
          borderRadius: "10px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          color: "primary.onSurface",
          bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.1),
          "& .MuiSvgIcon-root": { fontSize: 22 },
        })}
      >
        {previewUrl && isImage ? (
          <Box component="img" src={previewUrl} alt="elQR" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <QrCode2Outlined />
        )}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {has ? (fileName || "elQR загружен") : "Загрузить elQR"}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {has ? "Нажмите, чтобы заменить" : "PNG/JPG/PDF — фото QR-кода банка"}
        </Typography>
      </Box>
      {has && onRemove && (
        <IconButton
          size="small"
          aria-label="Удалить elQR"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          sx={(t) => ({
            color: "text.secondary",
            "&:hover": { color: t.palette.error.main, bgcolor: alpha(t.palette.error.main, 0.1) },
          })}
        >
          <DeleteOutline sx={{ fontSize: 18 }} />
        </IconButton>
      )}
      <input
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: "none" }}
        disabled={disabled}
        onChange={(e) => onPick(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
      />
    </Box>
  );
};
