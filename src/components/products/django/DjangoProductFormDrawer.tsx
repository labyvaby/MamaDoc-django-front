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
    ToggleButton,
    ToggleButtonGroup,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useNotification } from "@refinedev/core";
import {
    DjangoProduct,
    createProduct,
    updateProduct,
    uploadProductImage,
} from "../../../api/warehouse";
import { ApiError } from "../../../api/client";
import { AppCard } from "../../ui";

const noSpinnersSx = {
    "& input[type=number]": { MozAppearance: "textfield" },
    "& input[type=number]::-webkit-outer-spin-button": { WebkitAppearance: "none", margin: 0 },
    "& input[type=number]::-webkit-inner-spin-button": { WebkitAppearance: "none", margin: 0 },
};

type FormValues = {
    name: string;
    category: string;
    barcode: string;
    unit: string;
    description: string;
    comment: string;
    isForSale: boolean;
    isInfusion: boolean;
    price: number;
    stock: number;
};

const defaultValues: FormValues = {
    name: "",
    category: "",
    barcode: "",
    unit: "",
    description: "",
    comment: "",
    isForSale: true,
    isInfusion: false,
    price: 0,
    stock: 0,
};

type DjangoProductFormDrawerProps = {
    open: boolean;
    onClose: () => void;
    /** null → создание нового товара. */
    product: DjangoProduct | null;
    onSaved?: () => void;
    /**
     * Остаток можно задавать только при выбранном филиале (иначе бэкенд
     * не знает, в склад какого филиала оформить приход/корректировку).
     */
    stockEditable?: boolean;
};

export const DjangoProductFormDrawer: React.FC<DjangoProductFormDrawerProps> = ({
    open,
    onClose,
    product,
    onSaved,
    stockEditable = true,
}) => {
    const { open: notify } = useNotification();
    const isEdit = !!product;
    const [values, setValues] = React.useState<FormValues>(defaultValues);
    const [photoFile, setPhotoFile] = React.useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [touched, setTouched] = React.useState(false);

    React.useEffect(() => {
        if (open) {
            setValues(
                product
                    ? {
                        name: product.name,
                        category: product.category,
                        barcode: product.barcode,
                        unit: product.unit,
                        description: product.description,
                        comment: product.comment,
                        isForSale: product.isForSale,
                        isInfusion: product.isInfusion,
                        price: product.price,
                        stock: product.stock,
                    }
                    : defaultValues,
            );
            setPhotoFile(null);
            setPreviewUrl(null);
            setBusy(false);
            setTouched(false);
        } else if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, product]);

    const handleFileChange = (file: File | null) => {
        setPhotoFile(file);
        setPreviewUrl(file ? URL.createObjectURL(file) : null);
    };

    const handleSubmit = async () => {
        setTouched(true);
        if (!values.name.trim()) {
            notify?.({ type: "error", message: "Название товара обязательно" });
            return;
        }

        setBusy(true);
        try {
            const common = {
                name: values.name.trim(),
                category: values.category.trim(),
                barcode: values.barcode.trim(),
                unit: values.unit.trim() || "шт",
                description: values.description.trim(),
                comment: values.comment.trim(),
                isForSale: values.isForSale,
                isInfusion: values.isInfusion,
                price: Number(values.price) || 0,
            };

            let saved: DjangoProduct;
            if (isEdit && product) {
                saved = await updateProduct(product.id, {
                    ...common,
                    // Остаток сверяется с текущим через корректировку —
                    // только в контексте филиала.
                    ...(stockEditable ? { stock: Number(values.stock) || 0 } : {}),
                });
            } else {
                saved = await createProduct({
                    ...common,
                    ...(stockEditable ? { initialStock: Number(values.stock) || 0 } : {}),
                });
            }

            if (photoFile) {
                await uploadProductImage(saved.id, photoFile);
            }

            onSaved?.();
            notify?.({
                type: "success",
                message: isEdit ? "Товар обновлен" : "Товар добавлен",
            });
            onClose();
        } catch (e: unknown) {
            console.error("Save product failed:", e);
            const message = e instanceof ApiError
                ? e.message
                : "Не удалось сохранить товар";
            notify?.({ type: "error", message });
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
                        py: 1.5,
                    }}
                >
                    <Typography variant="h6">{isEdit ? "Редактировать товар" : "Добавить товар"}</Typography>
                    <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
                        <CloseOutlined />
                    </IconButton>
                </Box>
                <Divider />
                <Box
                    sx={{
                        p: 2,
                        flex: 1,
                        overflowY: "auto",
                        scrollbarWidth: "none",
                        msOverflowStyle: "none",
                        "&::-webkit-scrollbar": {
                            display: "none",
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
                                        const el = document.getElementById("django-product-photo-input") as HTMLInputElement | null;
                                        el?.click();
                                    }}
                                >
                                    <Avatar
                                        variant="rounded"
                                        src={previewUrl || product?.imageUrl || undefined}
                                        sx={{ width: 48, height: 48 }}
                                    >
                                        <PhotoCameraOutlined />
                                    </Avatar>
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="body2">
                                            {photoFile ? photoFile.name : "Загрузить фото"}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Необязательно
                                        </Typography>
                                    </Box>
                                    <input
                                        id="django-product-photo-input"
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
                                value={values.name}
                                onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
                                fullWidth
                                error={touched && !values.name.trim()}
                                helperText={touched && !values.name.trim() ? "Обязательное поле" : ""}
                            />
                        </Stack>

                        {/* Barcode */}
                        <Stack spacing={0.5}>
                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                Штрихкод
                            </Typography>
                            <TextField
                                placeholder="Введите штрихкод"
                                value={values.barcode}
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
                                    value={values.category}
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
                                    value={values.unit}
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
                                justifyContent: "space-between",
                            }}
                        >
                            <Typography variant="body2">Статус продажи</Typography>
                            <ToggleButtonGroup
                                exclusive
                                size="small"
                                value={values.isForSale ? "active" : "hidden"}
                                onChange={(_, v) => {
                                    if (v) setValues((s) => ({ ...s, isForSale: v === "active" }));
                                }}
                            >
                                <ToggleButton
                                    value="active"
                                    sx={{
                                        textTransform: "none",
                                        px: 2,
                                        py: 0.5,
                                        "&.Mui-selected": {
                                            bgcolor: "success.main",
                                            color: "success.contrastText",
                                            "&:hover": { bgcolor: "success.dark" },
                                        },
                                    }}
                                >
                                    Активно
                                </ToggleButton>
                                <ToggleButton value="hidden" sx={{ textTransform: "none", px: 2, py: 0.5 }}>
                                    Недоступно
                                </ToggleButton>
                            </ToggleButtonGroup>
                        </Paper>

                        {/* Price & Stock */}
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
                                    sx={{ ...noSpinnersSx }}
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
                                    disabled={!stockEditable}
                                    helperText={!stockEditable ? "Доступно при выбранном филиале" : ""}
                                    InputProps={{
                                        endAdornment: <Typography variant="caption" color="text.secondary">{values.unit || "шт"}</Typography>,
                                    }}
                                    sx={{ ...noSpinnersSx }}
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
                                value={values.description}
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
                                justifyContent: "space-between",
                            }}
                        >
                            <Stack direction="row" spacing={1} alignItems="center">
                                <InfoOutlinedIcon fontSize="small" color="action" />
                                <Typography variant="body2">Капельница</Typography>
                            </Stack>
                            <ToggleButtonGroup
                                exclusive
                                size="small"
                                value={values.isInfusion ? "yes" : "no"}
                                onChange={(_, v) => {
                                    if (v) setValues((s) => ({ ...s, isInfusion: v === "yes" }));
                                }}
                            >
                                <ToggleButton value="yes" sx={{ textTransform: "none", px: 2, py: 0.5 }}>
                                    Да
                                </ToggleButton>
                                <ToggleButton value="no" sx={{ textTransform: "none", px: 2, py: 0.5 }}>
                                    Нет
                                </ToggleButton>
                            </ToggleButtonGroup>
                        </Paper>

                    </Stack>
                </Box>
                <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
                    <Stack direction="row" gap={1} justifyContent="flex-end">
                        <Button onClick={onClose} disabled={busy}>
                            Отмена
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleSubmit}
                            disabled={busy || !values.name.trim()}
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
