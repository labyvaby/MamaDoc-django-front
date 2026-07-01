import React from "react";
import {
    Box,
    Typography,
    Stack,
    IconButton,
    CircularProgress,
    Tooltip,
    alpha,
} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorderOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AddPhotoAlternateOutlined from "@mui/icons-material/AddPhotoAlternateOutlined";
import { useNotification } from "@refinedev/core";
import {
    DjangoProductImage,
    getProductGallery,
    uploadGalleryImage,
    updateGalleryImage,
    deleteGalleryImage,
} from "../../../api/warehouse";
import { ApiError, isAbortError } from "../../../api/client";

const MAX_IMAGES = 5;

type Props = {
    productId: number;
    /** Вызывается после любого изменения галереи (для обновления карточки товара). */
    onChanged?: () => void;
};

/**
 * Менеджер галереи товара: загрузка до 5 фото, выбор основного,
 * изменение порядка и удаление. Работает с существующим товаром (нужен id).
 */
export const DjangoProductGallery: React.FC<Props> = ({ productId, onChanged }) => {
    const { open: notify } = useNotification();
    const [images, setImages] = React.useState<DjangoProductImage[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    const load = React.useCallback(
        async (signal?: AbortSignal) => {
            try {
                setLoading(true);
                const rows = await getProductGallery(productId, signal);
                // Порядок — по полю order (на случай, если бэк вернёт иначе).
                setImages([...rows].sort((a, b) => a.order - b.order));
            } catch (e) {
                if (isAbortError(e)) return;
                console.error("Failed to load gallery:", e);
            } finally {
                if (!signal?.aborted) setLoading(false);
            }
        },
        [productId],
    );

    React.useEffect(() => {
        const c = new AbortController();
        load(c.signal);
        return () => c.abort();
    }, [load]);

    const notifyError = (e: unknown, fallback: string) => {
        console.error(e);
        notify?.({ type: "error", message: e instanceof ApiError ? e.message : fallback });
    };

    const handleUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const room = MAX_IMAGES - images.length;
        if (room <= 0) {
            notify?.({ type: "error", message: `Максимум ${MAX_IMAGES} изображений` });
            return;
        }
        const toUpload = Array.from(files).slice(0, room);
        setBusy(true);
        try {
            for (const file of toUpload) {
                await uploadGalleryImage(productId, file);
            }
            await load();
            onChanged?.();
        } catch (e) {
            notifyError(e, "Не удалось загрузить изображение");
        } finally {
            setBusy(false);
        }
    };

    const handleSetPrimary = async (img: DjangoProductImage) => {
        if (img.isPrimary) return;
        setBusy(true);
        try {
            await updateGalleryImage(productId, img.id, { isPrimary: true });
            await load();
            onChanged?.();
        } catch (e) {
            notifyError(e, "Не удалось сделать фото основным");
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (img: DjangoProductImage) => {
        setBusy(true);
        try {
            await deleteGalleryImage(productId, img.id);
            await load();
            onChanged?.();
        } catch (e) {
            notifyError(e, "Не удалось удалить изображение");
        } finally {
            setBusy(false);
        }
    };

    // Перестановка: меняем местами значения order у соседних изображений.
    const handleMove = async (index: number, dir: -1 | 1) => {
        const target = index + dir;
        if (target < 0 || target >= images.length) return;
        const a = images[index];
        const b = images[target];
        setBusy(true);
        try {
            await updateGalleryImage(productId, a.id, { order: b.order });
            await updateGalleryImage(productId, b.id, { order: a.order });
            await load();
            onChanged?.();
        } catch (e) {
            notifyError(e, "Не удалось изменить порядок");
        } finally {
            setBusy(false);
        }
    };

    const canAddMore = images.length < MAX_IMAGES;

    return (
        <Stack spacing={1}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Галерея ({images.length}/{MAX_IMAGES})
                </Typography>
                {busy && <CircularProgress size={16} />}
            </Stack>

            {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : (
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {images.map((img, i) => (
                        <Box
                            key={img.id}
                            sx={{
                                position: "relative",
                                width: 96,
                                height: 96,
                                borderRadius: "12px",
                                overflow: "hidden",
                                border: 2,
                                borderColor: img.isPrimary ? "primary.main" : "divider",
                                bgcolor: (theme) => alpha(theme.palette.action.hover, 0.4),
                                "&:hover .gallery-overlay": { opacity: 1 },
                            }}
                        >
                            <Box
                                component="img"
                                src={img.url}
                                alt=""
                                sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />

                            {img.isPrimary && (
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: 4,
                                        left: 4,
                                        px: 0.75,
                                        py: 0.25,
                                        borderRadius: "6px",
                                        bgcolor: "primary.main",
                                        color: "primary.contrastText",
                                        fontSize: "0.65rem",
                                        fontWeight: 700,
                                        lineHeight: 1.4,
                                    }}
                                >
                                    Основное
                                </Box>
                            )}

                            {/* Оверлей с действиями */}
                            <Box
                                className="gallery-overlay"
                                sx={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "space-between",
                                    p: 0.5,
                                    opacity: 0,
                                    transition: "opacity .15s ease",
                                    bgcolor: (theme) => alpha(theme.palette.common.black, 0.35),
                                }}
                            >
                                <Stack direction="row" justifyContent="flex-end">
                                    <Tooltip title={img.isPrimary ? "Основное фото" : "Сделать основным"}>
                                        <span>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleSetPrimary(img)}
                                                disabled={busy || img.isPrimary}
                                                sx={{ color: "#fff", p: 0.25 }}
                                            >
                                                {img.isPrimary ? (
                                                    <StarIcon sx={{ fontSize: 18, color: "#ffca28" }} />
                                                ) : (
                                                    <StarBorderIcon sx={{ fontSize: 18 }} />
                                                )}
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title="Удалить">
                                        <span>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleDelete(img)}
                                                disabled={busy}
                                                sx={{ color: "#fff", p: 0.25 }}
                                            >
                                                <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </Stack>
                                <Stack direction="row" justifyContent="space-between">
                                    <IconButton
                                        size="small"
                                        onClick={() => handleMove(i, -1)}
                                        disabled={busy || i === 0}
                                        sx={{ color: "#fff", p: 0.25 }}
                                        aria-label="Переместить левее"
                                    >
                                        <ChevronLeftIcon sx={{ fontSize: 18 }} />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        onClick={() => handleMove(i, 1)}
                                        disabled={busy || i === images.length - 1}
                                        sx={{ color: "#fff", p: 0.25 }}
                                        aria-label="Переместить правее"
                                    >
                                        <ChevronRightIcon sx={{ fontSize: 18 }} />
                                    </IconButton>
                                </Stack>
                            </Box>
                        </Box>
                    ))}

                    {canAddMore && (
                        <Box
                            onClick={() => !busy && inputRef.current?.click()}
                            sx={{
                                width: 96,
                                height: 96,
                                borderRadius: "12px",
                                border: "2px dashed",
                                borderColor: "divider",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 0.5,
                                cursor: busy ? "default" : "pointer",
                                color: "text.secondary",
                                transition: "border-color .15s ease, color .15s ease",
                                "&:hover": { borderColor: "primary.main", color: "primary.main" },
                            }}
                        >
                            <AddPhotoAlternateOutlined sx={{ fontSize: 22 }} />
                            <Typography variant="caption">Добавить</Typography>
                        </Box>
                    )}
                </Stack>
            )}

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                    handleUpload(e.target.files);
                    e.target.value = "";
                }}
            />
        </Stack>
    );
};
