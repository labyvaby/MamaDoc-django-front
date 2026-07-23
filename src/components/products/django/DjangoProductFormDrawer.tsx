import React from "react";
import {
    Autocomplete,
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
    Switch,
    ToggleButton,
    ToggleButtonGroup,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import { useNotification } from "@refinedev/core";
import {
    DjangoProduct,
    createProduct,
    updateProduct,
    uploadProductImage,
} from "../../../api/warehouse";
import { ApiError } from "../../../api/client";
import { AppCard } from "../../ui";
import { DjangoProductGallery } from "./DjangoProductGallery";

const noSpinnersSx = {
    "& input[type=number]": { MozAppearance: "textfield" },
    "& input[type=number]::-webkit-outer-spin-button": { WebkitAppearance: "none", margin: 0 },
    "& input[type=number]::-webkit-inner-spin-button": { WebkitAppearance: "none", margin: 0 },
};

/**
 * Каноничный список единиц измерения для дропдауна. Поле `unit` на бэке —
 * свободная строка, поэтому Autocomplete с freeSolo: можно выбрать из списка
 * или ввести своё (совместимость со старыми значениями).
 */
const PRODUCT_UNITS = [
    "шт",
    "упак",
    "мл",
    "л",
    "г",
    "кг",
    "амп",
    "фл",
    "таб",
    "доза",
    "шприц",
    "набор",
];

type FormValues = {
    name: string;
    category: string;
    barcode: string;
    unit: string;
    description: string;
    comment: string;
    isForSale: boolean;
    isInfusion: boolean;
    isVaccine: boolean;
    price: number;
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
    isVaccine: false,
    price: 0,
};

type DjangoProductFormDrawerProps = {
    open: boolean;
    onClose: () => void;
    /** null → создание нового товара. */
    product: DjangoProduct | null;
    onSaved?: () => void;
};

export const DjangoProductFormDrawer: React.FC<DjangoProductFormDrawerProps> = ({
    open,
    onClose,
    product,
    onSaved,
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
                        isVaccine: product.isVaccine,
                        price: product.price,
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
                isVaccine: values.isVaccine,
                price: Number(values.price) || 0,
            };

            let saved: DjangoProduct;
            if (isEdit && product) {
                // Остаток здесь не задаётся — управляется через движения
                // (приход/списание/передача).
                saved = await updateProduct(product.id, common);
            } else {
                saved = await createProduct(common);
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
                        {/* Галерея (для существующего товара) или одиночный аплоадер (при создании) */}
                        {isEdit && product ? (
                            <DjangoProductGallery productId={product.id} onChanged={onSaved} />
                        ) : (
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
                                        src={previewUrl || undefined}
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
                        )}

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
                                <Autocomplete
                                    freeSolo
                                    options={PRODUCT_UNITS}
                                    value={values.unit}
                                    onChange={(_, v) => setValues((s) => ({ ...s, unit: v ?? "" }))}
                                    onInputChange={(_, v) => setValues((s) => ({ ...s, unit: v }))}
                                    renderInput={(params) => (
                                        <TextField {...params} placeholder="Единица" fullWidth />
                                    )}
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

                        {/* Vaccine flag: источник истины «это вакцина». Включение
                            авто-создаёт/активирует медкарточку в разделе «Прививки». */}
                        <Paper
                            elevation={0}
                            variant="outlined"
                            sx={{ p: 1.5, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}
                        >
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2">Вакцина</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Включение создаёт карточку вакцины в разделе «Прививки»
                                    и позволяет заводить партии.
                                </Typography>
                            </Box>
                            <Switch
                                checked={values.isVaccine}
                                onChange={(e) => setValues((s) => ({ ...s, isVaccine: e.target.checked }))}
                            />
                        </Paper>

                        {/* Price */}
                        <Stack spacing={0.5}>
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
