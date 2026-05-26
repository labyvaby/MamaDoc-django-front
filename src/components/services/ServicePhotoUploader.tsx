/**
 * ServicePhotoUploader.tsx
 * Презентационный блок загрузки фотографии услуги.
 * Отвечает только за UI: карточка с аватаром-превью, текстом и скрытым input type="file".
 * Вся логика выбора файла делегируется через onPickPhoto.
 */
import React from "react";
import {
  Stack,
  Typography,
  Card,
  CardContent,
  Avatar,
  Box,
} from "@mui/material";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";

export type ServicePhotoUploaderProps = {
  photoFile: File | null;
  photoPreview: string | null;
  inputId?: string; // можно переопределить id инпута
  onPickPhoto: (file: File | null) => void;
};

const ServicePhotoUploader: React.FC<ServicePhotoUploaderProps> = ({
  photoPreview,
  inputId = "add-service-file-input",
  onPickPhoto,
}) => {
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" color="text.secondary">
        Картинка
      </Typography>
      <Card variant="outlined" sx={{ borderStyle: "dashed" }}>
        <CardContent
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            py: 2,
            cursor: "pointer",
          }}
          onClick={() => {
            const el = document.getElementById(inputId) as HTMLInputElement | null;
            el?.click();
          }}
        >
          <Avatar
            variant="rounded"
            src={photoPreview || undefined}
            sx={{ width: 48, height: 48 }}
          >
            <PhotoCameraOutlined />
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              {photoPreview ? "Сменить фото" : "Добавить фото"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Необязательно
            </Typography>
          </Box>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
              const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
              onPickPhoto(f);
            }}
          />
        </CardContent>
      </Card>
    </Stack>
  );
};

export default ServicePhotoUploader;
