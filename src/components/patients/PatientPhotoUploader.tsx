/**
 * PatientPhotoUploader.tsx
 * Круглый аватар-загрузчик фото пациента: превью + камера-бейдж + input type="file".
 * Ховер затемняет фото и показывает иконку камеры (подсказка «сменить»).
 */
import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import { UserAvatar } from "../ui";
import { subtleBg } from "../../theme/uiHelpers";
import { PHOTO_ACCEPT } from "../../utility/imageCompression";

export type PatientPhotoUploaderProps = {
  photoFile: File | null;
  photoPreview: string | null;
  inputId?: string;
  onPickPhoto: (file: File | null) => void;
  disabled?: boolean;
  /** Диаметр аватара; в плотной форме — 56 рядом с полем ФИО. */
  size?: number;
  /** Подпись «Добавить/Изменить фото» под аватаром. */
  showCaption?: boolean;
};

const DEFAULT_SIZE = 88;

const PatientPhotoUploader: React.FC<PatientPhotoUploaderProps> = ({
  photoPreview,
  inputId = "add-patient-file-input",
  onPickPhoto,
  disabled,
  size = DEFAULT_SIZE,
  showCaption = true,
}) => {
  // Бейдж камеры масштабируется с аватаром, но не мельче 22px — иначе в него
  // не попасть пальцем.
  const badge = Math.max(22, Math.round(size * 0.32));
  const [hover, setHover] = React.useState(false);

  const openPicker = () => {
    if (disabled) return;
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    el?.click();
  };

  return (
    <Stack alignItems="center" spacing={1}>
      <Box
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={openPicker}
        sx={(t) => ({
          position: "relative",
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: "50%",
          cursor: disabled ? "default" : "pointer",
          border: 1,
          borderColor: "divider",
          bgcolor: subtleBg(t),
          opacity: disabled ? 0.6 : 1,
        })}
      >
        <UserAvatar src={photoPreview} size={size} sx={{ position: "absolute", inset: 0 }} />

        {photoPreview && (
          <Box
            sx={(t) => ({
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: t.palette.common.white,
              bgcolor: alpha(t.palette.common.black, hover ? 0.45 : 0),
              opacity: hover ? 1 : 0,
              transition: "background-color .15s ease, opacity .15s ease",
            })}
          >
            <PhotoCameraOutlined fontSize="small" />
          </Box>
        )}

        <Box
          sx={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: badge,
            height: badge,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            border: "2px solid",
            borderColor: "background.paper",
          }}
        >
          <PhotoCameraOutlined sx={{ fontSize: Math.round(badge / 2) }} />
        </Box>

        <input
          id={inputId}
          type="file"
          accept={PHOTO_ACCEPT}
          disabled={disabled}
          style={{ display: "none" }}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
            onPickPhoto(f);
          }}
        />
      </Box>

      {showCaption && (
        <Typography
          variant="body2"
          color="text.secondary"
          onClick={openPicker}
          sx={{ cursor: disabled ? "default" : "pointer" }}
        >
          {photoPreview ? "Изменить фото" : "Добавить фото"}
        </Typography>
      )}
    </Stack>
  );
};

export default PatientPhotoUploader;
