import React from "react";
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    Drawer,
    IconButton,
    Stack,
    TextField,
    Typography,
    CardContent,
    Avatar,
    Paper,
    Tabs,
    Tab,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useNotification } from "@refinedev/core";
import { updateProduct, Product, UpdateProductData } from "../../services/products";
import { uploadProductPhoto } from "../../services/storage";
import { AppCard } from "../ui";

// Custom styles for the toggle tabs
const toggleTabStyles = (theme: any, color: string) => ({
    minHeight: 40,
    borderRadius: 1,
    textTransform: "none",
    fontSize: "0.875rem",
    fontWeight: 500,
    color: "text.secondary",
    "&.Mui-selected": {
        color: theme.palette.getContrastText(color),
        bgcolor: color,
    },
    transition: "all 0.2s",
});

type EditProductDrawerProps = {
    open: boolean;
    product: Product | null;
    onClose: () => void;
    onUpdated?: () => void;
};

export const EditProductDrawer: React.FC<EditProductDrawerProps> = ({
    open,
    product,
    onClose,
    onUpdated,
}) => {
    const { open: notify } = useNotification();
    const [values, setValues] = React.useState<UpdateProductData>({});
    const [photoFile, setPhotoFile] = React.useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [touched, setTouched] = React.useState(false);

    React.useEffect(() => {
        if (open && product) {
            setTouched(false);
            setValues({
                name: product.name,
                category: product.category || "",
                barcode: product.barcode || "",
                unit: product.unit || "",
                description: product.description || "",
                comment: product.comment || "",
                image_url: product.image_url || undefined,
                is_for_sale: product.is_for_sale ?? true,
                is_infusion: product.is_infusion ?? false,
                price: product.price || 0,
                stock: product.stock || 0,
            });
            setPreviewUrl(product.image_url || null);
        } else {
            setValues({});
            setPhotoFile(null);
            setPreviewUrl(null);
        }
    }, [open, product]);

    const handleFileChange = (file: File | null) => {
        setPhotoFile(file);
        if (file) {
            setPreviewUrl(URL.createObjectURL(file));
        } else {
            setPreviewUrl(product?.image_url || null);
        }
    };

    const handleSubmit = async () => {
        setTouched(true);
        if (!product) return;
        if (!values.name?.trim()) {
            notify?.({ type: "error", message: "Название товара обязательно" });
            return;
        }

        setBusy(true);
        try {
            let publicUrl = values.image_url;

            if (photoFile) {
                const res = await uploadProductPhoto(photoFile);
                publicUrl = res.publicUrl;
            }

            await updateProduct(product.sellable_item_id, {
                ...values,
                image_url: publicUrl,
                name: values.name.trim(),
                barcode: values.barcode?.trim() || undefined,
                unit: values.unit?.trim() || undefined,
                category: values.category?.trim() || undefined,
                description: values.description?.trim() || undefined,
                comment: values.comment?.trim() || undefined,
                price: Number(values.price) || 0,
                stock: Number(values.stock) || 0,
            });

            if (onUpdated) onUpdated();
            notify?.({ type: "success", message: "Товар обновлен" });
            onClose();
        } catch (e: unknown) {
            console.error("Update product failed:", e);
            notify?.({ type: "error", message: "Не удалось обновить товар" });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={busy ? undefined : onClose}
            PaperProps={{ sx: { width: { xs: 320, sm: 480, md: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
        >
            <Box sx={{ width: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        px: 2,
                        py: 1,
                    }}
                >
                    <Typography variant="h6">Редактировать товар</Typography>
                    <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
                        <CloseOutlined />
                    </IconButton>
                </Box>
                <Divider />
                <Box
                    sx={{
                        p: 2,
                        flex: 1,
                        overflowY: 'auto',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        '&::-webkit-scrollbar': {
                            display: 'none',
                        },
                    }}
                >
                    <Stack spacing={3}>
                        {/* Photo Uploader */}
                        <Stack spacing={0.5}>
                            <AppCard variant="outlined" sx={{ borderStyle: "dashed" }} disableContentPadding>
                                <CardContent
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1.5,
                                        py: 2,
                                        cursor: "pointer",
                                    }}
                                    onClick={() => {
                                        const el = document.getElementById("edit-product-photo-input") as HTMLInputElement | null;
                                        el?.click();
                                    }}
                                >
                                    <Avatar
                                        variant="rounded"
                                        src={previewUrl || undefined}
                                        sx={{ width: 48, height: 48 }}
                                    >
                                        <PhotoCameraOutlined />
                                    </Avatar>
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="body2">
                                            {photoFile ? photoFile.name : "Сменить фото"}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Необязательно
                                        </Typography>
                                    </Box>
                                    <input
                                        id="edit-product-photo-input"
                                        type="file"
                                        accept="image/*"
                                        style={{ display: "none" }}
                                        onChange={(e) => {
                                            const f = e.target.files?.[0] || null;
                                            handleFileChange(f);
                                        }}
                                    />
                                </CardContent>
                            </AppCard>
                        </Stack>

                        {/* Name Input */}
                        <Stack spacing={0.5}>
                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                Название товара *
                            </Typography>
                            <TextField
                                placeholder="Введите название товара"
                                value={values.name || ""}
                                onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
                                fullWidth
                                error={touched && !values.name?.trim()}
                                helperText={touched && !values.name?.trim() ? "Обязательное поле" : ""}
                            />
                        </Stack>

                        {/* Barcode */}
                        <Stack spacing={0.5}>
                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                Штрихкод
                            </Typography>
                            <TextField
                                placeholder="Введите штрихкод"
                                value={values.barcode || ""}
                                onChange={(e) => setValues((s) => ({ ...s, barcode: e.target.value }))}
                                fullWidth
                            />
                        </Stack>

                        <Stack direction="row" spacing={2}>
                            {/* Category */}
                            <Stack spacing={0.5} sx={{ flex: 1 }}>
                                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                    Категория
                                </Typography>
                                <TextField
                                    placeholder="Категория"
                                    value={values.category || ""}
                                    onChange={(e) => setValues((s) => ({ ...s, category: e.target.value }))}
                                    fullWidth
                                />
                            </Stack>
                            {/* Unit */}
                            <Stack spacing={0.5} sx={{ flex: 1 }}>
                                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                    Ед. измерения
                                </Typography>
                                <TextField
                                    placeholder="Единица"
                                    value={values.unit || ""}
                                    onChange={(e) => setValues((s) => ({ ...s, unit: e.target.value }))}
                                    fullWidth
                                />
                            </Stack>
                        </Stack>

                        {/* Sale Status Toggle */}
                        <Paper
                            elevation={0}
                            variant="outlined"
                            sx={{
                                p: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between"
                            }}
                        >
                            <Typography variant="body2">Статус продажи</Typography>
                            <Tabs
                                value={values.is_for_sale ? 0 : 1}
                                onChange={(_, v) =>
                                    setValues((s) => ({ ...s, is_for_sale: v === 0 }))
                                }
                                sx={{ minHeight: 32 }}
                                TabIndicatorProps={{ style: { display: "none" } }}
                            >
                                <Tab
                                    label="Активно"
                                    sx={(theme) => ({ ...toggleTabStyles(theme, theme.palette.success.main), minHeight: 32, py: 0, px: 2 })}
                                />
                                <Tab
                                    label="Недоступно"
                                    sx={(theme) => ({ ...toggleTabStyles(theme, theme.palette.action.disabledBackground), minHeight: 32, py: 0, px: 2, '&.Mui-selected': { bgcolor: 'action.selected', color: 'text.primary' } })}
                                />
                            </Tabs>
                        </Paper>

                        {/* Price & Stock - Standard Inputs */}
                        <Stack direction="row" spacing={2}>
                            <Stack spacing={0.5} sx={{ flex: 1 }}>
                                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                    Стоимость
                                </Typography>
                                <TextField
                                    placeholder="0"
                                    type="number"
                                    value={values.price || ""}
                                    onChange={(e) =>
                                        setValues((s) => ({ ...s, price: Number(e.target.value) || 0 }))
                                    }
                                    fullWidth
                                    InputProps={{
                                        endAdornment: <Typography variant="caption" color="text.secondary">сом</Typography>,
                                    }}
                                    sx={{
                                        "& input[type=number]": {
                                            MozAppearance: "textfield",
                                        },
                                        "& input[type=number]::-webkit-outer-spin-button": {
                                            WebkitAppearance: "none",
                                            margin: 0,
                                        },
                                        "& input[type=number]::-webkit-inner-spin-button": {
                                            WebkitAppearance: "none",
                                            margin: 0,
                                        },
                                    }}
                                />
                            </Stack>
                            <Stack spacing={0.5} sx={{ flex: 1 }}>
                                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                    Остаток
                                </Typography>
                                <TextField
                                    placeholder="0"
                                    type="number"
                                    value={values.stock || ""}
                                    onChange={(e) =>
                                        setValues((s) => ({ ...s, stock: Number(e.target.value) || 0 }))
                                    }
                                    fullWidth
                                    InputProps={{
                                        endAdornment: <Typography variant="caption" color="text.secondary">шт</Typography>,
                                    }}
                                    sx={{
                                        "& input[type=number]": {
                                            MozAppearance: "textfield",
                                        },
                                        "& input[type=number]::-webkit-outer-spin-button": {
                                            WebkitAppearance: "none",
                                            margin: 0,
                                        },
                                        "& input[type=number]::-webkit-inner-spin-button": {
                                            WebkitAppearance: "none",
                                            margin: 0,
                                        },
                                    }}
                                />
                            </Stack>
                        </Stack>

                        {/* Description */}
                        <Stack spacing={0.5}>
                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                Описание
                            </Typography>
                            <TextField
                                placeholder="Добавьте описание (необязательно)"
                                value={values.description || ""}
                                onChange={(e) => setValues((s) => ({ ...s, description: e.target.value }))}
                                fullWidth
                                multiline
                                rows={3}
                            />
                        </Stack>

                        {/* Infusion Toggle */}
                        <Paper
                            elevation={0}
                            variant="outlined"
                            sx={{
                                p: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between"
                            }}
                        >
                            <Stack direction="row" spacing={1} alignItems="center">
                                <InfoOutlinedIcon fontSize="small" color="action" />
                                <Typography variant="body2">Капельница</Typography>
                            </Stack>
                            <Tabs
                                value={values.is_infusion ? 0 : 1}
                                onChange={(_, v) =>
                                    setValues((s) => ({ ...s, is_infusion: v === 0 }))
                                }
                                sx={{ minHeight: 32 }}
                                TabIndicatorProps={{ style: { display: "none" } }}
                            >
                                <Tab
                                    label="Да"
                                    sx={(theme) => ({ ...toggleTabStyles(theme, theme.palette.primary.main), minHeight: 32, py: 0, px: 2 })}
                                />
                                <Tab
                                    label="Нет"
                                    sx={(theme) => ({ ...toggleTabStyles(theme, theme.palette.action.disabledBackground), minHeight: 32, py: 0, px: 2, '&.Mui-selected': { bgcolor: 'action.selected', color: 'text.primary' } })}
                                />
                            </Tabs>
                        </Paper>

                    </Stack>
                </Box>
                <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                    <Stack direction="row" gap={1} justifyContent="flex-end">
                        <Button onClick={onClose} disabled={busy}>
                            Отмена
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleSubmit}
                            disabled={busy || !values.name?.trim()}
                        >
                            {busy ? (
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <CircularProgress size={18} />
                                    <span>Сохранение…</span>
                                </Stack>
                            ) : (
                                "Сохранить"
                            )}
                        </Button>
                    </Stack>
                </Box>
            </Box>
        </Drawer>
    );
};
