import React from "react";
import {
    Stack,
    Typography,
    Card,
    CardContent,
    Avatar,
    Box,
    IconButton,
    Grid,
} from "@mui/material";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";

export type PassportPhotoUploaderProps = {
    photos: string[]; // URLs of already uploaded photos
    onAddPhoto: (file: File) => void;
    onRemovePhoto: (url: string) => void;
    inputId?: string;
};

const PassportPhotoUploader: React.FC<PassportPhotoUploaderProps> = ({
    photos = [],
    onAddPhoto,
    onRemovePhoto,
    inputId = "passport-photo-input",
}) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onAddPhoto(e.target.files[0]);
        }
    };

    return (
        <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                Паспортные данные (фотографии)
            </Typography>

            <Grid container spacing={1}>
                {photos.map((url) => (
                    <Grid item key={url}>
                        <Card variant="outlined" sx={{ position: "relative", width: 80, height: 80 }}>
                            <Avatar
                                variant="rounded"
                                src={url}
                                sx={{ width: "100%", height: "100%" }}
                            />
                            <IconButton
                                size="small"
                                onClick={() => onRemovePhoto(url)}
                                sx={{
                                    position: "absolute",
                                    top: 0,
                                    right: 0,
                                    bgcolor: "rgba(255,255,255,0.7)",
                                    "&:hover": { bgcolor: "rgba(255,255,255,0.9)" },
                                }}
                            >
                                <DeleteOutline fontSize="small" color="error" />
                            </IconButton>
                        </Card>
                    </Grid>
                ))}

                <Grid item>
                    <Card
                        variant="outlined"
                        sx={{
                            width: 80,
                            height: 80,
                            borderStyle: "dashed",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                        }}
                        onClick={() => {
                            const el = document.getElementById(inputId) as HTMLInputElement | null;
                            el?.click();
                        }}
                    >
                        <PhotoCameraOutlined color="action" />
                        <input
                            id={inputId}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={handleFileChange}
                        />
                    </Card>
                </Grid>
            </Grid>

            <Typography variant="caption" color="text.secondary">
                Можно добавить несколько фотографий разворотов паспорта
            </Typography>
        </Stack>
    );
};

export default PassportPhotoUploader;
