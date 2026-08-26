import React from "react";
import {
    Alert, Autocomplete, Avatar, Box, Button, CardContent, Chip, CircularProgress,
    Divider, Drawer, IconButton, InputAdornment, MenuItem, Paper, Stack, Switch, TextField,
    ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import QrCodeOutlined from "@mui/icons-material/QrCodeOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
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
type Values = { name: string; barcode: string; unit: string; description: string; comment: string; isForSale: boolean; isInfusion: boolean; isVaccine: boolean; price: number };
const blank: Values = { name: "", barcode: "", unit: "шт", description: "", comment: "", isForSale: true, isInfusion: false, isVaccine: false, price: 0 };
type Props = { open: boolean; onClose: () => void; product: DjangoProduct | null; onSaved?: () => void };

/** A category owns the form schema. The product drawer only renders that schema. */
export const DjangoProductFormDrawer: React.FC<Props> = ({ open, onClose, product, onSaved }) => {
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
        setValues(product ? { name: product.name, barcode: product.barcode, unit: product.unit || "шт", description: product.description, comment: product.comment, isForSale: product.isForSale, isInfusion: product.isInfusion, isVaccine: canUseVaccines && product.isVaccine, price: product.price } : blank);
        setCategoryId(product?.categoryId ?? null);
        setFieldValues(Object.fromEntries((product?.attributes ?? []).filter((item) => item.role === "generic").map((item) => [item.attributeId, item.valueId])));
        setColors([]); setSizes([]); setSkuPrefix(""); setPhoto(null); setPhotoUrl(null); setBusy(false); form.reset(); void loadSchema();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, product, canUseVaccines, loadSchema]);
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

    return <Drawer anchor="right" open={open} onClose={busy ? undefined : onClose} PaperProps={{ sx: { width: { xs: 360, sm: 540, md: 600 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}><Box sx={{ minHeight: 0, height: "100%", display: "flex", flexDirection: "column" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.75 }}><Box><Typography variant="h6">{isEdit ? "Редактировать товар" : "Добавить товар"}</Typography><Typography variant="caption" color="text.secondary">{isMatrix ? "Эта категория создаёт варианты по цветам и размерам." : "Поля формы определяет выбранная категория."}</Typography></Box><IconButton onClick={onClose} disabled={busy}><CloseOutlined /></IconButton></Stack><Divider />
        <Box sx={{ p: { xs: 2, sm: 2.5 }, flex: 1, overflowY: "auto" }}><MotionStack spacing={2.5} variants={cascadeContainer} initial="hidden" animate="show">
            {!isMatrix && <MotionBox variants={cascadeItem}>{isEdit && product ? <DjangoProductGallery productId={product.id} onChanged={onSaved} /> : <AppCard variant="outlined" sx={{ borderStyle: "dashed" }} disableContentPadding><CardContent onClick={() => document.getElementById("django-product-photo-input")?.click()} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.5, cursor: "pointer" }}><Avatar variant="rounded" src={photoUrl || undefined} sx={{ width: 48, height: 48 }}><PhotoCameraOutlined /></Avatar><Box sx={{ flex: 1 }}><Typography variant="body2">{photo ? photo.name : "Загрузить фото"}</Typography><Typography variant="caption" color="text.secondary">Необязательно</Typography></Box><input id="django-product-photo-input" type="file" accept={PHOTO_ACCEPT} hidden onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} /></CardContent></AppCard>}</MotionBox>}
            <MotionBox variants={cascadeItem}><Stack spacing={0.75}><Typography variant="body2" color="text.secondary" fontWeight={700}>{isMatrix ? "Название модели *" : "Название товара *"}</Typography><TextField autoFocus size="small" fullWidth value={values.name} disabled={busy} onChange={(e) => set({ name: e.target.value })} placeholder={isMatrix ? "Например, Пальто шерстяное oversize" : "Введите название товара"} {...form.field("name")} InputProps={{ startAdornment: <InputAdornment position="start"><Inventory2Outlined fontSize="small" color="disabled" /></InputAdornment> }} /></Stack></MotionBox>
            <MotionBox variants={cascadeItem}><Stack spacing={1.25}><Divider /><Typography variant="caption" fontWeight={700} color="text.secondary">Категория</Typography>{isRetail ? <TextField select fullWidth size="small" label="Категория товара *" value={categoryId ?? ""} disabled={busy || loadingSchema} onChange={(e) => { setCategoryId(e.target.value === "" ? null : Number(e.target.value)); setFieldValues({}); setColors([]); setSizes([]); }}><MenuItem value="">Выберите категорию</MenuItem>{categories.filter((item) => item.isActive).map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField> : <TextField size="small" fullWidth label="Категория" value={product?.category ?? ""} disabled />}{isMatrix && <TextField size="small" fullWidth label="Префикс артикула" value={skuPrefix} disabled={busy} placeholder="MONO-PLT" helperText="Варианты получат артикулы вида MONO-PLT-BLK-42." onChange={(e) => setSkuPrefix(e.target.value.toUpperCase())} />}<Autocomplete freeSolo size="small" options={UNITS} value={values.unit} disabled={busy} onChange={(_, next) => set({ unit: next ?? "шт" })} onInputChange={(_, next) => set({ unit: next })} renderInput={(params) => <TextField {...params} label="Единица измерения" />} /></Stack></MotionBox>
            {!isMatrix && <MotionBox variants={cascadeItem}><TextField size="small" fullWidth label="Штрихкод" value={values.barcode} disabled={busy} onChange={(e) => set({ barcode: e.target.value })} InputProps={{ startAdornment: <InputAdornment position="start"><QrCodeOutlined fontSize="small" color="disabled" /></InputAdornment> }} /></MotionBox>}
            {isRetail && category && <MotionBox variants={cascadeItem}><Stack spacing={1.25}><Divider /><Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="caption" fontWeight={700} color="text.secondary">Поля категории «{category.name}»</Typography><Tooltip title="Настроить категорию"><IconButton component="a" href="/settings/product-attributes" size="small"><SettingsOutlined fontSize="small" /></IconButton></Tooltip></Stack>{genericFields.map((field) => { const options = field.values.filter((item) => item.isActive); const current = options.find((item) => item.id === fieldValues[field.id]) ?? null; return <Autocomplete key={field.id} size="small" options={options} value={current} disabled={busy} onChange={(_, next) => setFieldValues((old) => ({ ...old, [field.id]: next?.id ?? null }))} getOptionLabel={(item) => item.value} isOptionEqualToValue={(a, b) => a.id === b.id} renderInput={(params) => <TextField {...params} label={field.name} />} />; })}{isMatrix && <><Typography variant="caption" fontWeight={700} color="text.secondary">Варианты</Typography>{selectAxis(`${colorField?.name ?? "Цвет"} *`, colorField, colors, setColors, <PaletteOutlined fontSize="small" />)}{selectAxis(`${sizeField?.name ?? "Размер"} *`, sizeField, sizes, setSizes, <StraightenOutlined fontSize="small" />)}</>}{!categoryAttributes.length && <Alert severity="info">Для этой категории нет дополнительных полей. Добавьте их в настройках категории.</Alert>}</Stack></MotionBox>}
            {!isMatrix && <MotionBox variants={cascadeItem}><Stack spacing={1.25}><Divider /><Typography variant="caption" fontWeight={700} color="text.secondary">Статус</Typography><Paper variant="outlined" sx={{ p: 1.25, display: "flex", alignItems: "center", justifyContent: "space-between" }}><Typography variant="body2">Статус продажи</Typography><ToggleButtonGroup exclusive size="small" value={values.isForSale ? "active" : "hidden"} onChange={(_, next) => next && set({ isForSale: next === "active" })}><ToggleButton value="active" sx={{ textTransform: "none" }}>Активно</ToggleButton><ToggleButton value="hidden" sx={{ textTransform: "none" }}>Скрыто</ToggleButton></ToggleButtonGroup></Paper>{canUseVaccines && <Paper variant="outlined" sx={{ p: 1.25, display: "flex", justifyContent: "space-between", alignItems: "center" }}><Typography variant="body2">Вакцина</Typography><Switch checked={values.isVaccine} onChange={(e) => set({ isVaccine: e.target.checked })} /></Paper>}</Stack></MotionBox>}
            <MotionBox variants={cascadeItem}><Stack spacing={1.25}><Divider /><Typography variant="caption" fontWeight={700} color="text.secondary">Цена и описание</Typography><TextField size="small" fullWidth type="number" label="Цена продажи, сом" value={values.price || ""} disabled={busy} onChange={(e) => set({ price: Number(e.target.value) || 0 })} InputProps={{ startAdornment: <InputAdornment position="start"><PaymentsOutlined fontSize="small" color="disabled" /></InputAdornment> }} /><TextField fullWidth multiline rows={3} label="Описание" value={values.description} disabled={busy} onChange={(e) => set({ description: e.target.value })} /></Stack></MotionBox>
        </MotionStack></Box><Divider /><Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ p: 2 }}><Button onClick={onClose} disabled={busy}>Отмена</Button><Button variant="contained" onClick={() => void save()} disabled={busy || loadingSchema} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlined />}>{busy ? "Сохранение…" : isMatrix ? "Создать варианты" : "Сохранить"}</Button></Stack>
    </Box></Drawer>;
};
