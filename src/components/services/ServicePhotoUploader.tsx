import React from "react";
import { Avatar, Box, Card, CardContent, Stack, Typography } from "@mui/material";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import { useT } from "../../i18n/VerticalProvider";
import { PHOTO_ACCEPT } from "../../utility/imageCompression";

export type ServicePhotoUploaderProps = {
  photoFile: File | null;
  photoPreview: string | null;
  inputId?: string;
  onPickPhoto: (file: File | null) => void;
};

const ServicePhotoUploader: React.FC<ServicePhotoUploaderProps> = ({ photoPreview, inputId = "service-file-input", onPickPhoto }) => {
  const { t } = useT("services");
  return <Stack spacing={0.5}>
    <Typography variant="body2" color="text.secondary">{t("photo.label")}</Typography>
    <Card variant="outlined" sx={{ borderStyle: "dashed" }}>
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 2, cursor: "pointer" }} onClick={() => document.getElementById(inputId)?.click()}>
        <Avatar variant="rounded" src={photoPreview || undefined}><PhotoCameraOutlined /></Avatar>
        <Box sx={{ flex: 1 }}><Typography variant="subtitle1" fontWeight={600}>{photoPreview ? t("photo.change") : t("photo.add")}</Typography><Typography variant="body2" color="text.secondary">{t("photo.optional")}</Typography></Box>
        <input id={inputId} type="file" accept={PHOTO_ACCEPT} hidden onChange={(event) => onPickPhoto(event.target.files?.[0] ?? null)} />
      </CardContent>
    </Card>
  </Stack>;
};

export default ServicePhotoUploader;
