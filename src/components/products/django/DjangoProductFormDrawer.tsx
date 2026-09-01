import React from "react";
import {
    Alert, Autocomplete, Avatar, Box, Button, CardContent, Chip,
    Drawer, IconButton, InputAdornment, MenuItem, Paper, Stack, Switch, TextField,
    ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import QrCodeOutlined from "@mui/icons-material/QrCodeOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import { motion } from "framer-motion";
import { useNotification } from "@refinedev/core";

import { ApiError } from "../../../api/client";
import {
    createProduct, createProductModel, generateProductMatrix, getProductAttributes,
    getProductCategoryTree, replaceProductGenericAttributes, type DjangoProduct,
    type DjangoProductAttribute, type DjangoProductAttributeValueOption,
    type DjangoProductCategoryNode, updateProduct, uploadProductImage,
} from "../../../api/warehouse";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { useFormValidation } from "../../../hooks/useFormValidation";
import { usePermissions } from "../../../hooks/usePermissions";
import { cascadeContainer, cascadeItem } from "../../ui";
import { DjangoProductGallery } from "./DjangoProductGallery";
import { PHOTO_ACCEPT } from "../../../utility/imageCompression";

const UNITS = ["шт", "упак", "мл", "л", "г", "кг", "амп", "фл", "таб", "доза", "шприц", "набор"];
const MotionStack = motion(Stack);
const MotionBox = motion(Box);
type Values = { name: string; barcode: string; unit: string; description: string; comment: string; isForSale: boolean; isInfusion: boolean; isVaccine: boolean; price: number };
const blank: Values = { name: "", barcode: "", unit: "шт", description: "", comment: "", isForSale: true, isInfusion: false, isVaccine: false, price: 0 };
type Props = {
    open: boolean;
    onClose: () => void;
    product: DjangoProduct | null;
    onSaved?: () => void;
    /** Штрихкод, пробитый сканером на инвентаризации — подставляем в новый товар. */
    initialBarcode?: string;
};

/** A category owns the form schema. The product drawer only renders that schema. */
export const DjangoProductFormDrawer: React.FC<Props> = ({ open, onClose, product, onSaved, initialBarcode }) => {
    const { open: notify } = useNotification();
    const orgId = useApiOrgId();
    const { enabledModules, activeOrganization } = usePermissions();
    const isRetail = activeOrganization?.vertical === "retail";
    const canUseVaccines = (enabledModules ?? []).includes("vaccinations");
    const isEdit = Boolean(product);
    const [values, setValues] = React.useState<Values>(blank);
    const [photo, setPhoto] = React.useState<File | null>(null);
    const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
    const [attributes, setAttributes] = React.useState<DjangoProductAttribute[]>([]);
    const [categories, setCategories] = React.useState<DjangoProductCategoryNode[]>([]);
    const [categoryId, setCategoryId] = React.useState<number | null>(null);
    const [fieldValues, setFieldValues] = React.useState<Record<number, number | null>>({});
    const [colors, setColors] = React.useState<number[]>([]);
    const [sizes, setSizes] = React.useState<number[]>([]);
    const [skuPrefix, setSkuPrefix] = React.useState("");
    const [loadingSchema, setLoadingSchema] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const form = useFormValidation({ name: values.name.trim() ? null : "Введите название товара" });
    const category = categories.find((item) => item.id === categoryId) ?? null;
    const categoryAttributes = attributes.filter((item) => category?.attributeIds.includes(item.id) && item.isActive);
    const genericFields = categoryAttributes.filter((item) => item.role === "generic");
    const colorField = categoryAttributes.find((item) => item.role === "color");
    const sizeField = categoryAttributes.find((item) => item.role === "size");
    const isMatrix = !isEdit && Boolean(colorField && sizeField);
    const variantsCount = colors.length * sizes.length;

    const loadSchema = React.useCallback(async () => {
        if (!isRetail) return;
        setLoadingSchema(true);
        try {
            const [nextAttributes, nextCategories] = await Promise.all([getProductAttributes(undefined, orgId), getProductCategoryTree(undefined, orgId)]);
            setAttributes(nextAttributes); setCategories(nextCategories);
        } catch (error) {
            console.error("Unable to load category form schema", error);
            notify?.({ type: "error", message: "Не удалось загрузить категории товара" });
        } finally { setLoadingSchema(false); }
    }, [isRetail, notify, orgId]);

    React.useEffect(() => {
        if (!open) return;
        setValues(product ? { name: product.name, barcode: product.barcode, unit: product.unit || "шт", description: product.description, comment: product.comment, isForSale: product.isForSale, isInfusion: product.isInfusion, isVaccine: canUseVaccines && product.isVaccine, price: product.price } : { ...blank, barcode: initialBarcode?.trim() ?? "" });
        setCategoryId(product?.categoryId ?? null);
        setFieldValues(Object.fromEntries((product?.attributes ?? []).filter((item) => item.role === "generic").map((item) => [item.attributeId, item.valueId])));
        setColors([]); setSizes([]); setSkuPrefix(""); setPhoto(null); setPhotoUrl(null); setBusy(false); form.reset(); void loadSchema();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, product, canUseVaccines, loadSchema, initialBarcode]);
    React.useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

    const set = (patch: Partial<Values>) => setValues((current) => ({ ...current, ...patch }));
    const genericIds = () => genericFields.map((field) => fieldValues[field.id]).filter((id): id is number => typeof id === "number");
    const selected = (field: DjangoProductAttribute | undefined, ids: number[]) => field?.values.filter((item) => item.isActive && ids.includes(item.id)) ?? [];
    const setPhotoFile = (file: File | null) => { if (photoUrl) URL.revokeObjectURL(photoUrl); setPhoto(file); setPhotoUrl(file ? URL.createObjectURL(file) : null); };
    const selectAxis = (label: string, field: DjangoProductAttribute | undefined, ids: number[], change: (ids: number[]) => void, icon: React.ReactNode) => <Autocomplete<DjangoProductAttributeValueOption, true, false, false> multiple size="small" options={field?.values.filter((item) => item.isActive) ?? []} value={selected(field, ids)} onChange={(_, next) => change(next.map((item) => item.id))} getOptionLabel={(item) => item.value} isOptionEqualToValue={(a, b) => a.id === b.id} disabled={!field || busy} renderTags={(tags, getTagProps) => tags.map((item, index) => <Chip {...getTagProps({ index })} key={item.id} size="small" label={item.value} />)} renderInput={(params) => <TextField {...params} label={label} helperText="Список и порядок настраиваются в категории." InputProps={{ ...params.InputProps, startAdornment: <InputAdornment position="start">{icon}</InputAdornment> }} />} />;

    const save = async () => {
        if (!form.validate()) return;
        if (isRetail && !category) { notify?.({ type: "error", message: "Сначала выберите категорию товара" }); return; }
        if (isMatrix && (!colors.length || !sizes.length)) { notify?.({ type: "error", message: "Выберите хотя бы один цвет и размер" }); return; }
        setBusy(true);
        try {
            if (isMatrix && category && colorField && sizeField) {
                const model = await createProductModel({ name: values.name.trim(), skuPrefix: skuPrefix.trim(), categoryId: category.id, description: values.description.trim(), organizationId: orgId });
                const matrix = await generateProductMatrix({ modelId: model.id, rowValueIds: colors, columnValueIds: sizes, attributeValueIds: genericIds(), price: values.price || 0, unit: values.unit || "шт", generateBarcodes: true });
                notify?.({ type: "success", message: `Добавлено вариантов: ${matrix.filled}` });
            } else {
                const payload = { name: values.name.trim(), category: category?.name ?? "", categoryId: category?.id, barcode: values.barcode.trim(), unit: values.unit || "шт", description: values.description.trim(), comment: values.comment.trim(), isForSale: values.isForSale, isInfusion: values.isInfusion, isVaccine: canUseVaccines && values.isVaccine, price: values.price || 0 };
                const saved = isEdit && product ? await updateProduct(product.id, payload) : await createProduct(payload);
                if (isRetail) await replaceProductGenericAttributes(saved.id, genericIds());
                if (photo) await uploadProductImage(saved.id, photo);
                notify?.({ type: "success", message: isEdit ? "Товар обновлён" : "Товар добавлен" });
            }
            onSaved?.(); onClose();
        } catch (error) { notify?.({ type: "error", message: error instanceof ApiError ? error.message : "Не удалось сохранить товар" }); }
        finally { setBusy(false); }
    };

    const handlePhotoDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0] ?? null;
        if (file) setPhotoFile(file);
    };

    const sectionHeader = (
        icon: React.ReactNode,
        title: string,
        subtitle: string,
        action?: React.ReactNode,
    ) => (
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5}>
            <Stack direction="row" alignItems="flex-start" gap={1.25} sx={{ minWidth: 0 }}>
                <Box
                    sx={{
                        width: 34,
                        height: 34,
                        flex: "0 0 auto",
                        display: "grid",
                        placeItems: "center",
                        borderRadius: 2,
                        color: "primary.main",
                        bgcolor: "action.hover",
                    }}
                >
                    {icon}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={800}>
                        {title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {subtitle}
                    </Typography>
                </Box>
            </Stack>
            {action}
        </Stack>
    );

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={busy ? undefined : onClose}
            PaperProps={{
                sx: {
                    width: { xs: "100vw", sm: 560, md: 680 },
                    maxWidth: "100vw",
                    display: "flex",
                    flexDirection: "column",
                    bgcolor: "background.default",
                    borderTopLeftRadius: { xs: 0, sm: 3 },
                    borderBottomLeftRadius: { xs: 0, sm: 3 },
                    overflow: "hidden",
                },
            }}
        >
            <Box sx={{ minHeight: 0, height: "100%", display: "flex", flexDirection: "column" }}>
                <Box
                    sx={{
                        px: { xs: 2, sm: 3 },
                        pt: { xs: 2, sm: 2.5 },
                        pb: 2,
                        bgcolor: "background.paper",
                        borderBottom: 1,
                        borderColor: "divider",
                    }}
                >
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
                        <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
                            <Avatar
                                variant="rounded"
                                sx={{
                                    width: 46,
                                    height: 46,
                                    borderRadius: 2.5,
                                    color: "primary.main",
                                    bgcolor: "action.hover",
                                }}
                            >
                                <Inventory2Outlined />
                            </Avatar>
                            <Box sx={{ minWidth: 0 }}>
                                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                                    <Typography variant="h6" fontWeight={850} noWrap>
                                        {isEdit ? "Редактировать товар" : "Новый товар"}
                                    </Typography>
                                    <Chip
                                        size="small"
                                        label={isEdit ? "Изменение" : "Создание"}
                                        sx={{ borderRadius: 1.5, fontWeight: 700 }}
                                    />
                                </Stack>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                                    {isMatrix
                                        ? "Соберите матрицу вариантов по цветам и размерам"
                                        : category
                                            ? "Поля настроены для категории «" + category.name + "»"
                                            : "Сначала выберите категорию товара"}
                                </Typography>
                            </Box>
                        </Stack>
                        <IconButton
                            onClick={onClose}
                            disabled={busy}
                            aria-label="Закрыть drawer"
                            sx={{ mt: -0.5 }}
                        >
                            <CloseOutlined />
                        </IconButton>
                    </Stack>
                    <Stack direction="row" alignItems="center" gap={0.75} sx={{ mt: 2 }}>
                        {["Основное", "Атрибуты", "Цена"].map((step, index) => (
                            <React.Fragment key={step}>
                                <Chip
                                    size="small"
                                    label={step}
                                    color={index === 0 || (index === 1 && category) ? "primary" : "default"}
                                    variant={index === 0 || (index === 1 && category) ? "filled" : "outlined"}
                                    sx={{ borderRadius: 1.5, fontWeight: 700 }}
                                />
                                {index < 2 && (
                                    <Typography variant="caption" color="text.disabled">
                                        →
                                    </Typography>
                                )}
                            </React.Fragment>
                        ))}
                    </Stack>
                </Box>

                {loadingSchema && <Box sx={{ height: 2, bgcolor: "primary.main", opacity: 0.6 }} />}

                <Box
                    sx={{
                        p: { xs: 1.5, sm: 2.5 },
                        flex: 1,
                        minHeight: 0,
                        overflowY: "auto",
                        bgcolor: "action.hover",
                    }}
                >
                    <MotionStack
                        spacing={{ xs: 1.5, sm: 2 }}
                        variants={cascadeContainer}
                        initial="hidden"
                        animate="show"
                    >
                        <MotionBox variants={cascadeItem}>
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: { xs: 1.5, sm: 2 },
                                    borderRadius: 3,
                                    bgcolor: "background.paper",
                                }}
                            >
                                {sectionHeader(
                                    <Inventory2Outlined fontSize="small" />,
                                    "Основная информация",
                                    isMatrix
                                        ? "Название модели — оно станет основой для всех вариантов"
                                        : "Название и визуальная карточка товара",
                                )}
                                <Stack spacing={1.5} sx={{ mt: 2 }}>
                                    {/*
                                      Фото грузится только для одиночного товара: матрица уходит в
                                      createProductModel + generateProductMatrix, а там принимать
                                      изображение некуда. Раньше дропзона показывалась и в матрице —
                                      файл выбирался и молча пропадал.
                                    */}
                                    {isEdit && product ? (
                                        <DjangoProductGallery productId={product.id} onChanged={onSaved} />
                                    ) : isMatrix ? null : (
                                        <CardContent
                                            component="div"
                                            onClick={() =>
                                                document.getElementById("django-product-photo-input")?.click()
                                            }
                                            onDragOver={(event) => event.preventDefault()}
                                            onDrop={handlePhotoDrop}
                                            sx={{
                                                p: "12px !important",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 1.5,
                                                cursor: "pointer",
                                                border: 1,
                                                borderStyle: "dashed",
                                                borderColor: "divider",
                                                borderRadius: 2.5,
                                                bgcolor: "action.hover",
                                                transition: "all .2s ease",
                                                "&:hover": {
                                                    borderColor: "primary.main",
                                                    bgcolor: "background.default",
                                                },
                                            }}
                                        >
                                            <Avatar
                                                variant="rounded"
                                                src={photoUrl || undefined}
                                                sx={{
                                                    width: { xs: 56, sm: 64 },
                                                    height: { xs: 56, sm: 64 },
                                                    borderRadius: 2,
                                                    bgcolor: photoUrl ? "transparent" : "primary.main",
                                                }}
                                            >
                                                {!photoUrl && <PhotoCameraOutlined />}
                                            </Avatar>
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography variant="body2" fontWeight={800} noWrap>
                                                    {photo ? photo.name : "Добавьте фото товара"}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Выберите изображение или перетащите файл · необязательно
                                                </Typography>
                                            </Box>
                                            <PhotoCameraOutlined color="action" />
                                            <input
                                                id="django-product-photo-input"
                                                type="file"
                                                accept={PHOTO_ACCEPT}
                                                hidden
                                                onChange={(event) =>
                                                    setPhotoFile(event.target.files?.[0] ?? null)
                                                }
                                            />
                                        </CardContent>
                                    )}
                                    <Stack spacing={0.75}>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            fontWeight={800}
                                        >
                                            {isMatrix ? "Название модели *" : "Название товара *"}
                                        </Typography>
                                        <TextField
                                            autoFocus
                                            fullWidth
                                            value={values.name}
                                            disabled={busy}
                                            onChange={(event) => set({ name: event.target.value })}
                                            placeholder={
                                                isMatrix
                                                    ? "Например, Пальто шерстяное oversize"
                                                    : "Введите название товара"
                                            }
                                            {...form.field("name")}
                                            sx={{
                                                "& .MuiOutlinedInput-root": {
                                                    borderRadius: 2,
                                                    bgcolor: "background.paper",
                                                },
                                            }}
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <Inventory2Outlined fontSize="small" color="disabled" />
                                                    </InputAdornment>
                                                ),
                                                endAdornment: values.name.trim() ? (
                                                    <InputAdornment position="end">
                                                        <CheckCircleOutlined fontSize="small" color="success" />
                                                    </InputAdornment>
                                                ) : undefined,
                                            }}
                                        />
                                    </Stack>
                                </Stack>
                            </Paper>
                        </MotionBox>

                        <MotionBox variants={cascadeItem}>
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: { xs: 1.5, sm: 2 },
                                    borderRadius: 3,
                                    bgcolor: "background.paper",
                                }}
                            >
                                {sectionHeader(
                                    <SettingsOutlined fontSize="small" />,
                                    "Категория и схема",
                                    "Категория определяет поля и тип создания товара",
                                )}
                                <Stack spacing={1.5} sx={{ mt: 2 }}>
                                    {isRetail ? (
                                        <TextField
                                            select
                                            fullWidth
                                            label="Категория товара *"
                                            value={categoryId ?? ""}
                                            disabled={busy || loadingSchema}
                                            onChange={(event) => {
                                                setCategoryId(
                                                    event.target.value === ""
                                                        ? null
                                                        : Number(event.target.value),
                                                );
                                                setFieldValues({});
                                                setColors([]);
                                                setSizes([]);
                                                setSkuPrefix("");
                                            }}
                                            helperText={
                                                category
                                                    ? "Активная схема: " +
                                                    categoryAttributes.length +
                                                    " " +
                                                    (categoryAttributes.length === 1 ? "поле" : "поля")
                                                    : "Выберите категорию, чтобы увидеть доступные поля"
                                            }
                                            sx={{
                                                "& .MuiOutlinedInput-root": {
                                                    borderRadius: 2,
                                                    bgcolor: "background.paper",
                                                },
                                            }}
                                        >
                                            <MenuItem value="">Выберите категорию</MenuItem>
                                            {categories
                                                .filter((item) => item.isActive)
                                                .map((item) => (
                                                    <MenuItem key={item.id} value={item.id}>
                                                        {item.name}
                                                    </MenuItem>
                                                ))}
                                        </TextField>
                                    ) : (
                                        <TextField
                                            fullWidth
                                            label="Категория"
                                            value={product?.category ?? ""}
                                            disabled
                                        />
                                    )}
                                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                                        {isMatrix && (
                                            <TextField
                                                fullWidth
                                                label="Префикс артикула"
                                                value={skuPrefix}
                                                disabled={busy}
                                                placeholder="MONO-PLT"
                                                onChange={(event) =>
                                                    setSkuPrefix(event.target.value.toUpperCase())
                                                }
                                                helperText="Например: MONO-PLT-BLK-42"
                                            />
                                        )}
                                        <Autocomplete
                                            freeSolo
                                            fullWidth
                                            size="small"
                                            options={UNITS}
                                            value={values.unit}
                                            disabled={busy}
                                            onChange={(_, next) => set({ unit: next ?? "шт" })}
                                            onInputChange={(_, next) => set({ unit: next })}
                                            renderInput={(params) => (
                                                <TextField {...params} label="Единица измерения" />
                                            )}
                                        />
                                    </Stack>
                                </Stack>
                            </Paper>
                        </MotionBox>

                        {isRetail && category && (
                            <MotionBox variants={cascadeItem}>
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: { xs: 1.5, sm: 2 },
                                        borderRadius: 3,
                                        bgcolor: "background.paper",
                                        borderColor: isMatrix ? "primary.light" : "divider",
                                    }}
                                >
                                    {sectionHeader(
                                        <SettingsOutlined fontSize="small" />,
                                        "Поля категории «" + category.name + "»",
                                        isMatrix
                                            ? "Из выбранных значений автоматически создадутся SKU"
                                            : "Эти поля настроены в разделе категорий",
                                        <Tooltip title="Настроить категорию">
                                            <IconButton
                                                component={RouterLink}
                                                to="/settings/product-attributes"
                                                size="small"
                                                aria-label="Настроить категорию"
                                            >
                                                <SettingsOutlined fontSize="small" />
                                            </IconButton>
                                        </Tooltip>,
                                    )}
                                    <Stack spacing={1.5} sx={{ mt: 2 }}>
                                        {genericFields.map((field) => {
                                            const options = field.values.filter((item) => item.isActive);
                                            const current =
                                                options.find(
                                                    (item) => item.id === fieldValues[field.id],
                                                ) ?? null;
                                            return (
                                                <Autocomplete
                                                    key={field.id}
                                                    size="small"
                                                    options={options}
                                                    value={current}
                                                    disabled={busy}
                                                    onChange={(_, next) =>
                                                        setFieldValues((old) => ({
                                                            ...old,
                                                            [field.id]: next?.id ?? null,
                                                        }))
                                                    }
                                                    getOptionLabel={(item) => item.value}
                                                    isOptionEqualToValue={(a, b) => a.id === b.id}
                                                    renderInput={(params) => (
                                                        <TextField {...params} label={field.name} />
                                                    )}
                                                />
                                            );
                                        })}
                                        {isMatrix && (
                                            <Paper
                                                variant="outlined"
                                                sx={{
                                                    p: { xs: 1.25, sm: 1.5 },
                                                    borderRadius: 2.5,
                                                    bgcolor: "action.hover",
                                                    borderColor: "primary.light",
                                                }}
                                            >
                                                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                                                    <Box sx={{ flex: 1 }}>
                                                        {selectAxis(
                                                            (colorField?.name ?? "Цвет") + " *",
                                                            colorField,
                                                            colors,
                                                            setColors,
                                                            <PaletteOutlined fontSize="small" />,
                                                        )}
                                                    </Box>
                                                    <Box sx={{ flex: 1 }}>
                                                        {selectAxis(
                                                            (sizeField?.name ?? "Размер") + " *",
                                                            sizeField,
                                                            sizes,
                                                            setSizes,
                                                            <StraightenOutlined fontSize="small" />,
                                                        )}
                                                    </Box>
                                                </Stack>
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                    sx={{ display: "block", mt: 1.25 }}
                                                >
                                                    {colors.length && sizes.length
                                                        ? "Будет создано " +
                                                        variantsCount +
                                                        " SKU: " +
                                                        colors.length +
                                                        " × " +
                                                        sizes.length
                                                        : "Выберите хотя бы один цвет и размер"}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    color="text.disabled"
                                                    sx={{ display: "block", mt: 0.5 }}
                                                >
                                                    Фото, штрихкод и доступность продажи задаются у
                                                    каждого варианта после создания.
                                                </Typography>
                                            </Paper>
                                        )}
                                        {!categoryAttributes.length && (
                                            <Alert severity="info" sx={{ borderRadius: 2 }}>
                                                Для этой категории нет дополнительных полей. Добавьте их
                                                в настройках категории.
                                            </Alert>
                                        )}
                                    </Stack>
                                </Paper>
                            </MotionBox>
                        )}

                        <MotionBox variants={cascadeItem}>
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: { xs: 1.5, sm: 2 },
                                    borderRadius: 3,
                                    bgcolor: "background.paper",
                                }}
                            >
                                {sectionHeader(
                                    <PaymentsOutlined fontSize="small" />,
                                    "Цена и продажа",
                                    "Коммерческие параметры товара",
                                )}
                                <Stack spacing={1.5} sx={{ mt: 2 }}>
                                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                                        <TextField
                                            fullWidth
                                            type="number"
                                            label="Цена продажи, сом"
                                            value={values.price || ""}
                                            disabled={busy}
                                            onChange={(event) =>
                                                set({ price: Number(event.target.value) || 0 })
                                            }
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <PaymentsOutlined fontSize="small" color="disabled" />
                                                    </InputAdornment>
                                                ),
                                                endAdornment: (
                                                    <InputAdornment position="end">сом</InputAdornment>
                                                ),
                                            }}
                                        />
                                        {!isMatrix && (
                                            <TextField
                                                fullWidth
                                                label="Штрихкод"
                                                value={values.barcode}
                                                disabled={busy}
                                                onChange={(event) => set({ barcode: event.target.value })}
                                                InputProps={{
                                                    startAdornment: (
                                                        <InputAdornment position="start">
                                                            <QrCodeOutlined fontSize="small" color="disabled" />
                                                        </InputAdornment>
                                                    ),
                                                }}
                                            />
                                        )}
                                    </Stack>
                                    {/*
                                      Матрица уходит в createProductModel + generateProductMatrix,
                                      где нет ни isForSale, ни isVaccine. Раньше переключатели
                                      показывались и там: пользователь их выставлял, а выбор молча
                                      терялся. У готовых вариантов оба флага правятся поштучно.
                                    */}
                                    {!isMatrix && (
                                        <Paper
                                            variant="outlined"
                                            sx={{
                                                p: 1.5,
                                                borderRadius: 2.5,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: 2,
                                            }}
                                        >
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="body2" fontWeight={750}>
                                                    Доступен для продажи
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Товар будет виден в каталоге и кассе
                                                </Typography>
                                            </Box>
                                            <ToggleButtonGroup
                                                exclusive
                                                size="small"
                                                value={values.isForSale ? "active" : "hidden"}
                                                onChange={(_, next) =>
                                                    next && set({ isForSale: next === "active" })
                                                }
                                                disabled={busy}
                                            >
                                                <ToggleButton
                                                    value="active"
                                                    sx={{
                                                        textTransform: "none",
                                                        px: { xs: 1.25, sm: 2 },
                                                        borderRadius: 1.5,
                                                        "&.Mui-selected": {
                                                            color: "success.dark",
                                                            bgcolor: "success.50",
                                                        },
                                                    }}
                                                >
                                                    Да
                                                </ToggleButton>
                                                <ToggleButton
                                                    value="hidden"
                                                    sx={{
                                                        textTransform: "none",
                                                        px: { xs: 1.25, sm: 2 },
                                                        borderRadius: 1.5,
                                                    }}
                                                >
                                                    Нет
                                                </ToggleButton>
                                            </ToggleButtonGroup>
                                        </Paper>
                                    )}
                                    {canUseVaccines && !isMatrix && (
                                        <Paper
                                            variant="outlined"
                                            sx={{
                                                p: 1.5,
                                                borderRadius: 2.5,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: 2,
                                            }}
                                        >
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="body2" fontWeight={750}>
                                                    Вакцина
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Включение создаёт карточку вакцины и партии
                                                </Typography>
                                            </Box>
                                            <Switch
                                                checked={values.isVaccine}
                                                onChange={(event) =>
                                                    set({ isVaccine: event.target.checked })
                                                }
                                                disabled={busy}
                                            />
                                        </Paper>
                                    )}
                                </Stack>
                            </Paper>
                        </MotionBox>

                        <MotionBox variants={cascadeItem}>
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: { xs: 1.5, sm: 2 },
                                    borderRadius: 3,
                                    bgcolor: "background.paper",
                                }}
                            >
                                {sectionHeader(
                                    <InfoOutlined fontSize="small" />,
                                    "Описание",
                                    "Помогите продавцу быстро понять товар",
                                )}
                                <TextField
                                    fullWidth
                                    multiline
                                    minRows={3}
                                    label="Описание товара"
                                    placeholder="Материал, посадка, особенности, рекомендации по уходу…"
                                    value={values.description}
                                    disabled={busy}
                                    onChange={(event) => set({ description: event.target.value })}
                                    sx={{ mt: 2 }}
                                />
                            </Paper>
                        </MotionBox>
                    </MotionStack>
                </Box>

                <Box
                    sx={{
                        flex: "0 0 auto",
                        p: { xs: 1.5, sm: 2 },
                        pb: { xs: "calc(12px + env(safe-area-inset-bottom))", sm: 2 },
                        bgcolor: "background.paper",
                        borderTop: 1,
                        borderColor: "divider",
                        boxShadow: "0 -8px 24px rgba(15, 23, 42, 0.06)",
                    }}
                >
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        alignItems={{ xs: "stretch", sm: "center" }}
                        justifyContent="space-between"
                        gap={1.5}
                    >
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="caption" color="text.secondary" noWrap>
                                {isMatrix
                                    ? variantsCount
                                        ? variantsCount + " вариантов к созданию"
                                        : "Матрица ещё не заполнена"
                                    : category?.name || "Категория не выбрана"}
                            </Typography>
                            <Typography variant="body2" fontWeight={800} noWrap>
                                {values.name.trim() || "Заполните название товара"}
                            </Typography>
                        </Box>
                        <Stack direction="row" justifyContent="flex-end" gap={1}>
                            <Button
                                onClick={onClose}
                                disabled={busy}
                                sx={{ borderRadius: 2, minWidth: { xs: 0, sm: 92 } }}
                            >
                                Отмена
                            </Button>
                            <Button
                                variant="contained"
                                onClick={() => void save()}
                                disabled={busy || loadingSchema}
                                startIcon={<CheckCircleOutlined />}
                                sx={{
                                    borderRadius: 2,
                                    minWidth: { xs: 0, sm: 150 },
                                    boxShadow: "none",
                                }}
                            >
                                {busy ? "Сохранение…" : isMatrix ? "Создать варианты" : "Сохранить"}
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            </Box>
        </Drawer>
    );
};
