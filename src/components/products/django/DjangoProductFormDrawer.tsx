import React from "react";
import {
    Alert, Autocomplete, Avatar, Box, Button, CardContent, Chip, CircularProgress,
    Divider, Drawer, IconButton, InputAdornment, MenuItem, Paper, Stack, Switch,
    TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import QrCodeOutlined from "@mui/icons-material/QrCodeOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
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
import { AppCard, cascadeContainer, cascadeItem } from "../../ui";
import { DjangoProductGallery } from "./DjangoProductGallery";
import { PHOTO_ACCEPT } from "../../../utility/imageCompression";

const UNITS = ["шт", "упак", "мл", "л", "г", "кг", "амп", "фл", "таб", "доза", "шприц", "набор"];
const MotionStack = motion(Stack);
const MotionBox = motion(Box);

type FormValues = {
    name: string; category: string; barcode: string; unit: string; description: string;
    comment: string; isForSale: boolean; isInfusion: boolean; isVaccine: boolean; price: number;
};
const blank: FormValues = {
    name: "", category: "", barcode: "", unit: "шт", description: "", comment: "",
    isForSale: true, isInfusion: false, isVaccine: false, price: 0,
};
type Props = { open: boolean; onClose: () => void; product: DjangoProduct | null; onSaved?: () => void };

/** One catalogue drawer: a single item or a colour × size matrix. */
export const DjangoProductFormDrawer: React.FC<Props> = ({ open, onClose, product, onSaved }) => {
    const { open: notify } = useNotification();
    const orgId = useApiOrgId();
    const { enabledModules, activeOrganization } = usePermissions();
    const isRetail = activeOrganization?.vertical === "retail";
    const canUseVaccines = (enabledModules ?? []).includes("vaccinations");
    const isEdit = Boolean(product);
    const [mode, setMode] = React.useState<"single" | "variants">("single");
    const [values, setValues] = React.useState<FormValues>(blank);
    const [photo, setPhoto] = React.useState<File | null>(null);
    const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
    const [attributes, setAttributes] = React.useState<DjangoProductAttribute[]>([]);
    const [categories, setCategories] = React.useState<DjangoProductCategoryNode[]>([]);
    const [generic, setGeneric] = React.useState<Record<number, number | null>>({});
    const [colorAttributeId, setColorAttributeId] = React.useState<number | null>(null);
    const [sizeAttributeId, setSizeAttributeId] = React.useState<number | null>(null);
    const [colors, setColors] = React.useState<number[]>([]);
    const [sizes, setSizes] = React.useState<number[]>([]);
    const [categoryId, setCategoryId] = React.useState<number | null>(null);
    const [skuPrefix, setSkuPrefix] = React.useState("");
    const [loadingSchema, setLoadingSchema] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const form = useFormValidation({ name: values.name.trim() ? null : "Введите название товара" });

    const genericAttributes = attributes.filter((item) => item.isActive && item.role === "generic");
    const colorAttributes = attributes.filter((item) => item.isActive && item.role === "color");
    const sizeAttributes = attributes.filter((item) => item.isActive && item.role === "size");
    const colorAttribute = colorAttributes.find((item) => item.id === colorAttributeId);
    const sizeAttribute = sizeAttributes.find((item) => item.id === sizeAttributeId);

    const loadSchema = React.useCallback(async () => {
        if (!isRetail) return;
        setLoadingSchema(true);
        try {
            const [nextAttributes, nextCategories] = await Promise.all([
                getProductAttributes(undefined, orgId), getProductCategoryTree(undefined, orgId),
            ]);
            setAttributes(nextAttributes); setCategories(nextCategories);
            setColorAttributeId((old) => old ?? nextAttributes.find((a) => a.role === "color" && a.isActive)?.id ?? null);
            setSizeAttributeId((old) => old ?? nextAttributes.find((a) => a.role === "size" && a.isActive)?.id ?? null);
        } catch (error) {
            console.error("Unable to load product form schema", error);
            notify?.({ type: "error", message: "Не удалось загрузить свойства товара" });
        } finally { setLoadingSchema(false); }
    }, [isRetail, notify, orgId]);

    React.useEffect(() => {
        if (!open) return;
        setValues(product ? {
            name: product.name, category: product.category, barcode: product.barcode, unit: product.unit || "шт",
            description: product.description, comment: product.comment, isForSale: product.isForSale,
            isInfusion: product.isInfusion, isVaccine: canUseVaccines && product.isVaccine, price: product.price,
        } : blank);
        setMode("single"); setPhoto(null); setPhotoUrl(null); setSkuPrefix(""); setCategoryId(product?.categoryId ?? null);
        setColors([]); setSizes([]);
        setGeneric(Object.fromEntries((product?.attributes ?? []).filter((item) => item.role === "generic").map((item) => [item.attributeId, item.valueId])));
        setBusy(false); form.reset(); void loadSchema();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, product, canUseVaccines, loadSchema]);

    React.useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

    const genericIds = () => Object.values(generic).filter((id): id is number => typeof id === "number");
    const setPhotoFile = (file: File | null) => {
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        setPhoto(file); setPhotoUrl(file ? URL.createObjectURL(file) : null);
    };
    const set = (patch: Partial<FormValues>) => setValues((current) => ({ ...current, ...patch }));

    const save = async () => {
        if (!form.validate()) return;
        if (mode === "variants" && (!colorAttribute || !sizeAttribute || !colors.length || !sizes.length)) {
            notify?.({ type: "error", message: "Выберите хотя бы один цвет и размер" }); return;
        }
        setBusy(true);
        try {
            if (mode === "variants") {
                const model = await createProductModel({
                    name: values.name.trim(), skuPrefix: skuPrefix.trim(), categoryId: categoryId ?? undefined,
                    description: values.description.trim(), organizationId: orgId,
                });
                const matrix = await generateProductMatrix({
                    modelId: model.id, rowValueIds: colors, columnValueIds: sizes,
                    attributeValueIds: genericIds(), price: Number(values.price) || 0,
                    unit: values.unit.trim() || "шт", generateBarcodes: true,
                });
                notify?.({ type: "success", message: `Добавлено вариантов: ${matrix.filled}` });
            } else {
                const payload = {
                    name: values.name.trim(), category: values.category.trim(), barcode: values.barcode.trim(),
                    unit: values.unit.trim() || "шт", description: values.description.trim(), comment: values.comment.trim(),
                    isForSale: values.isForSale, isInfusion: values.isInfusion,
                    isVaccine: canUseVaccines && values.isVaccine, price: Number(values.price) || 0,
                };
                const saved = isEdit && product ? await updateProduct(product.id, payload) : await createProduct(payload);
                if (isRetail) await replaceProductGenericAttributes(saved.id, genericIds());
                if (photo) await uploadProductImage(saved.id, photo);
                notify?.({ type: "success", message: isEdit ? "Товар обновлён" : "Товар добавлен" });
            }
            onSaved?.(); onClose();
        } catch (error) {
            console.error("Unable to save product", error);
            notify?.({ type: "error", message: error instanceof ApiError ? error.message : "Не удалось сохранить товар" });
        } finally { setBusy(false); }
    };

    const selectValues = (label: string, attribute: DjangoProductAttribute | undefined, ids: number[], onChange: (next: number[]) => void, icon: React.ReactNode) => {
        const options = attribute?.values.filter((item) => item.isActive) ?? [];
        return <Autocomplete<DjangoProductAttributeValueOption, true, false, false> multiple size="small" options={options} value={options.filter((item) => ids.includes(item.id))}
            onChange={(_, next) => onChange(next.map((item) => item.id))} getOptionLabel={(item) => item.value}
            isOptionEqualToValue={(a, b) => a.id === b.id} disabled={!attribute || busy || loadingSchema}
            renderTags={(tags, getTagProps) => tags.map((item, index) => <Chip {...getTagProps({ index })} key={item.id} size="small" label={item.value} />)}
            renderInput={(params) => <TextField {...params} label={label} placeholder={attribute ? "Выберите значения" : "Настройте свойство"}
                helperText="Значения и порядок меняются в настройках." InputProps={{ ...params.InputProps, startAdornment: <InputAdornment position="start">{icon}</InputAdornment> }} />} />;
    };

    const variantMode = mode === "variants";
    return <Drawer anchor="right" open={open} onClose={busy ? undefined : onClose}
        PaperProps={{ sx: { width: { xs: 360, sm: 540, md: 600 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
        <Box sx={{ minHeight: 0, height: "100%", display: "flex", flexDirection: "column" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.75 }}>
                <Box><Typography variant="h6">{isEdit ? "Редактировать товар" : "Добавить товар"}</Typography><Typography variant="caption" color="text.secondary">{variantMode ? "Одна карточка сразу создаст варианты по цветам и размерам." : "Карточка товара и все её свойства в одном месте."}</Typography></Box>
                <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть"><CloseOutlined /></IconButton>
            </Stack><Divider />
            <Box sx={{ p: { xs: 2, sm: 2.5 }, flex: 1, overflowY: "auto" }}>
                <MotionStack spacing={2.5} variants={cascadeContainer} initial="hidden" animate="show">
                    {isRetail && !isEdit && <MotionBox variants={cascadeItem}><Paper variant="outlined" sx={{ p: 0.75, bgcolor: "action.hover" }}><ToggleButtonGroup exclusive fullWidth size="small" value={mode} onChange={(_, next) => next && setMode(next)} disabled={busy}><ToggleButton value="single" sx={{ textTransform: "none", gap: 0.75 }}><Inventory2Outlined fontSize="small" />Обычный товар</ToggleButton><ToggleButton value="variants" sx={{ textTransform: "none", gap: 0.75 }}><GridViewOutlined fontSize="small" />Товар с вариантами</ToggleButton></ToggleButtonGroup></Paper></MotionBox>}
                    {!variantMode && <MotionBox variants={cascadeItem}>{isEdit && product ? <DjangoProductGallery productId={product.id} onChanged={onSaved} /> : <AppCard variant="outlined" sx={{ borderStyle: "dashed" }} disableContentPadding><CardContent onClick={() => document.getElementById("django-product-photo-input")?.click()} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.5, cursor: "pointer" }}><Avatar variant="rounded" src={photoUrl || undefined} sx={{ width: 48, height: 48 }}><PhotoCameraOutlined /></Avatar><Box sx={{ flex: 1 }}><Typography variant="body2">{photo ? photo.name : "Загрузить фото"}</Typography><Typography variant="caption" color="text.secondary">Необязательно</Typography></Box><input id="django-product-photo-input" type="file" accept={PHOTO_ACCEPT} hidden onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} /></CardContent></AppCard>}</MotionBox>}
                    <MotionBox variants={cascadeItem}><Stack spacing={0.75}><Typography variant="body2" color="text.secondary" fontWeight={700}>{variantMode ? "Название модели *" : "Название товара *"}</Typography><TextField autoFocus fullWidth size="small" value={values.name} disabled={busy} placeholder={variantMode ? "Например, Пальто шерстяное oversize" : "Введите название товара"} onChange={(e) => set({ name: e.target.value })} {...form.field("name")} InputProps={{ startAdornment: <InputAdornment position="start"><Inventory2Outlined fontSize="small" color="disabled" /></InputAdornment> }} /></Stack></MotionBox>
                    {!variantMode && <MotionBox variants={cascadeItem}><TextField fullWidth size="small" label="Штрихкод" value={values.barcode} disabled={busy} placeholder="Введите штрихкод" onChange={(e) => set({ barcode: e.target.value })} InputProps={{ startAdornment: <InputAdornment position="start"><QrCodeOutlined fontSize="small" color="disabled" /></InputAdornment> }} /></MotionBox>}
                    <MotionBox variants={cascadeItem}><Stack spacing={1.25}><Divider /><Typography variant="caption" fontWeight={700} color="text.secondary">Классификация</Typography>{variantMode ? <><TextField select fullWidth size="small" label="Категория" value={categoryId ?? ""} disabled={busy || loadingSchema} onChange={(e) => setCategoryId(e.target.value === "" ? null : Number(e.target.value))} InputProps={{ startAdornment: <InputAdornment position="start"><CategoryOutlined fontSize="small" color="disabled" /></InputAdornment> }}><MenuItem value="">Без категории</MenuItem>{categories.filter((item) => item.isActive).map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField><TextField fullWidth size="small" label="Префикс артикула" value={skuPrefix} disabled={busy} placeholder="MONO-PLT" helperText="Варианты получат артикулы вида MONO-PLT-BLK-42." onChange={(e) => setSkuPrefix(e.target.value.toUpperCase())} /></> : <TextField fullWidth size="small" label="Категория" value={values.category} disabled={busy} placeholder="Например, Верхняя одежда" onChange={(e) => set({ category: e.target.value })} InputProps={{ startAdornment: <InputAdornment position="start"><CategoryOutlined fontSize="small" color="disabled" /></InputAdornment> }} />}<Autocomplete freeSolo size="small" options={UNITS} value={values.unit} disabled={busy} onChange={(_, next) => set({ unit: next ?? "шт" })} onInputChange={(_, next) => set({ unit: next })} renderInput={(params) => <TextField {...params} label="Единица измерения" />} /></Stack></MotionBox>
                    {isRetail && <MotionBox variants={cascadeItem}><Stack spacing={1.25}><Divider /><Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="caption" fontWeight={700} color="text.secondary">Свойства товара</Typography><Tooltip title="Настроить набор полей"><IconButton size="small" component="a" href="/settings/product-attributes"><SettingsOutlined fontSize="small" /></IconButton></Tooltip></Stack>{loadingSchema ? <Stack alignItems="center" py={2}><CircularProgress size={22} /></Stack> : genericAttributes.length ? genericAttributes.map((attribute) => { const options = attribute.values.filter((item) => item.isActive); const selected = options.find((item) => item.id === generic[attribute.id]) ?? null; return <Autocomplete key={attribute.id} size="small" options={options} value={selected} onChange={(_, next) => setGeneric((current) => ({ ...current, [attribute.id]: next?.id ?? null }))} getOptionLabel={(item) => item.value} isOptionEqualToValue={(a, b) => a.id === b.id} disabled={busy} renderInput={(params) => <TextField {...params} label={attribute.name} placeholder="Не выбрано" />} />; }) : <Alert severity="info" icon={<SettingsOutlined fontSize="inherit" />}>В «Настройках → Свойства товара» добавьте бренд, сезон, материал или свои поля. Они автоматически появятся здесь.</Alert>}</Stack></MotionBox>}
                    {variantMode && <MotionBox variants={cascadeItem}><Stack spacing={1.25}><Divider /><Typography variant="caption" fontWeight={700} color="text.secondary">Варианты</Typography><TextField select fullWidth size="small" label="Свойство цвета" value={colorAttributeId ?? ""} disabled={busy || loadingSchema} onChange={(e) => { setColorAttributeId(e.target.value === "" ? null : Number(e.target.value)); setColors([]); }}><MenuItem value="">Не выбрано</MenuItem>{colorAttributes.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField>{selectValues("Цвета *", colorAttribute, colors, setColors, <PaletteOutlined fontSize="small" />)}<TextField select fullWidth size="small" label="Размерная сетка" value={sizeAttributeId ?? ""} disabled={busy || loadingSchema} onChange={(e) => { setSizeAttributeId(e.target.value === "" ? null : Number(e.target.value)); setSizes([]); }}><MenuItem value="">Не выбрано</MenuItem>{sizeAttributes.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField>{selectValues("Размеры *", sizeAttribute, sizes, setSizes, <StraightenOutlined fontSize="small" />)}<Alert severity="info" variant="outlined">Новые цвета, размеры и пользовательские поля создаются в настройках — так справочник остаётся единым.</Alert></Stack></MotionBox>}
                    {!variantMode && <MotionBox variants={cascadeItem}><Stack spacing={1.25}><Divider /><Typography variant="caption" fontWeight={700} color="text.secondary">Статус</Typography><Paper variant="outlined" sx={{ p: 1.25, display: "flex", alignItems: "center", justifyContent: "space-between" }}><Typography variant="body2">Статус продажи</Typography><ToggleButtonGroup exclusive size="small" value={values.isForSale ? "active" : "hidden"} disabled={busy} onChange={(_, next) => next && set({ isForSale: next === "active" })}><ToggleButton value="active" sx={{ textTransform: "none" }}>Активно</ToggleButton><ToggleButton value="hidden" sx={{ textTransform: "none" }}>Скрыто</ToggleButton></ToggleButtonGroup></Paper>{canUseVaccines && <Paper variant="outlined" sx={{ p: 1.25, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}><Box><Typography variant="body2">Вакцина</Typography><Typography variant="caption" color="text.secondary">Показывать в разделе прививок.</Typography></Box><Switch checked={values.isVaccine} disabled={busy} onChange={(e) => set({ isVaccine: e.target.checked })} /></Paper>}</Stack></MotionBox>}
                    <MotionBox variants={cascadeItem}><Stack spacing={1.25}><Divider /><Typography variant="caption" fontWeight={700} color="text.secondary">Цена и описание</Typography><TextField fullWidth size="small" label="Цена продажи, сом" type="number" value={values.price || ""} disabled={busy} placeholder="0" onChange={(e) => set({ price: Number(e.target.value) || 0 })} InputProps={{ startAdornment: <InputAdornment position="start"><PaymentsOutlined fontSize="small" color="disabled" /></InputAdornment> }} /><TextField fullWidth multiline rows={3} label="Описание" value={values.description} disabled={busy} placeholder="Необязательно" onChange={(e) => set({ description: e.target.value })} /></Stack></MotionBox>
                </MotionStack>
            </Box><Divider />
            <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ p: 2 }}><Button onClick={onClose} disabled={busy}>Отмена</Button><Button variant="contained" onClick={() => void save()} disabled={busy || loadingSchema} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlined />}>{busy ? "Сохранение…" : variantMode ? "Создать варианты" : "Сохранить"}</Button></Stack>
        </Box>
    </Drawer>;
};
