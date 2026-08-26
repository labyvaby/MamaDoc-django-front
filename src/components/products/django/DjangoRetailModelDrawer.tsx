import React from "react";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    Drawer,
    IconButton,
    InputAdornment,
    MenuItem,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";
import LabelOutlined from "@mui/icons-material/LabelOutlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import { useNotification } from "@refinedev/core";

import { ApiError } from "../../../api/client";
import {
    createProductAttribute,
    createProductAttributeValue,
    createProductCategory,
    createProductModel,
    generateProductMatrix,
    getProductAttributes,
    getProductCategoryTree,
    type DjangoProductAttribute,
    type DjangoProductAttributeValueOption,
    type DjangoProductCategoryNode,
} from "../../../api/warehouse";
import { useApiOrgId } from "../../../hooks/useApiOrgId";

type ValueChoice = DjangoProductAttributeValueOption | string;

const normalize = (value: string) => value.trim().toLocaleLowerCase();
const optionLabel = (option: ValueChoice) => typeof option === "string" ? option : option.value;

const selectedValues = (
    attribute: DjangoProductAttribute | undefined,
    choices: ValueChoice[],
) => choices.filter((choice): choice is DjangoProductAttributeValueOption => typeof choice !== "string")
    .filter((choice) => attribute?.values.some((value) => value.id === choice.id) ?? false);

type Props = {
    open: boolean;
    onClose: () => void;
    onSaved?: () => void;
};

/**
 * The retail entry flow deliberately lives in one side drawer: first define
 * reusable properties, then create a garment as a colour × size SKU matrix.
 * It does not expose the storage model (one Product per SKU) to a buyer.
 */
export const DjangoRetailModelDrawer: React.FC<Props> = ({ open, onClose, onSaved }) => {
    const { open: notify } = useNotification();
    const orgId = useApiOrgId();
    const [attributes, setAttributes] = React.useState<DjangoProductAttribute[]>([]);
    const [categories, setCategories] = React.useState<DjangoProductCategoryNode[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [newAttributeName, setNewAttributeName] = React.useState("");
    const [newAttributeRole, setNewAttributeRole] = React.useState<DjangoProductAttribute["role"]>("generic");

    const [modelName, setModelName] = React.useState("");
    const [skuPrefix, setSkuPrefix] = React.useState("");
    const [categoryId, setCategoryId] = React.useState<number | null>(null);
    const [newCategoryName, setNewCategoryName] = React.useState("");
    const [brandAttributeId, setBrandAttributeId] = React.useState<number | null>(null);
    const [brand, setBrand] = React.useState<ValueChoice | null>(null);
    const [colors, setColors] = React.useState<ValueChoice[]>([]);
    const [sizes, setSizes] = React.useState<ValueChoice[]>([]);
    const [price, setPrice] = React.useState("");

    const colorAttribute = attributes.find((attribute) => attribute.role === "color");
    const sizeAttribute = attributes.find((attribute) => attribute.role === "size");
    const genericAttributes = attributes.filter((attribute) => attribute.role === "generic");
    const brandAttribute = genericAttributes.find((attribute) => attribute.id === brandAttributeId);

    const loadReferenceData = React.useCallback(async () => {
        setLoading(true);
        try {
            const [nextAttributes, nextCategories] = await Promise.all([
                getProductAttributes(undefined, orgId),
                getProductCategoryTree(undefined, orgId),
            ]);
            setAttributes(nextAttributes);
            setCategories(nextCategories);
            const detectedBrand = nextAttributes.find(
                (attribute) => attribute.role === "generic" && /бренд|brand/i.test(attribute.name),
            );
            setBrandAttributeId((current) => current ?? detectedBrand?.id ?? null);
        } catch (error) {
            console.error("Unable to load retail catalogue directories", error);
            notify?.({ type: "error", message: "Не удалось загрузить справочники товара" });
        } finally {
            setLoading(false);
        }
    }, [notify, orgId]);

    React.useEffect(() => {
        if (open) void loadReferenceData();
    }, [loadReferenceData, open]);

    const handleCreateAttribute = async () => {
        const name = newAttributeName.trim();
        if (!name) return;
        setBusy(true);
        try {
            const attribute = await createProductAttribute({
                name,
                role: newAttributeRole,
                organizationId: orgId,
            });
            setAttributes((current) => [...current, attribute]);
            if (attribute.role === "generic" && /бренд|brand/i.test(attribute.name)) {
                setBrandAttributeId(attribute.id);
            }
            setNewAttributeName("");
            notify?.({ type: "success", message: `Свойство «${attribute.name}» добавлено` });
        } catch (error) {
            notify?.({
                type: "error",
                message: error instanceof ApiError ? error.message : "Не удалось добавить свойство",
            });
        } finally {
            setBusy(false);
        }
    };

    const ensureValues = async (
        attribute: DjangoProductAttribute,
        choices: ValueChoice[],
    ): Promise<DjangoProductAttributeValueOption[]> => {
        const output = selectedValues(attribute, choices);
        const known = new Set(output.map((value) => normalize(value.value)));
        for (const choice of choices) {
            if (typeof choice !== "string") continue;
            const value = choice.trim();
            if (!value || known.has(normalize(value))) continue;
            output.push(await createProductAttributeValue(attribute.id, { value }));
            known.add(normalize(value));
        }
        return output;
    };

    const handleCreateModel = async () => {
        if (!modelName.trim() || !colorAttribute || !sizeAttribute) return;
        setBusy(true);
        try {
            let finalCategoryId = categoryId ?? undefined;
            if (newCategoryName.trim()) {
                const category = await createProductCategory({
                    name: newCategoryName.trim(),
                    organizationId: orgId,
                });
                finalCategoryId = category.id;
                setCategories((current) => [...current, category]);
            }

            const [colorValues, sizeValues, brandValues] = await Promise.all([
                ensureValues(colorAttribute, colors),
                ensureValues(sizeAttribute, sizes),
                brandAttribute && brand ? ensureValues(brandAttribute, [brand]) : Promise.resolve([]),
            ]);
            if (!colorValues.length || !sizeValues.length) {
                notify?.({ type: "error", message: "Укажите хотя бы один цвет и размер" });
                return;
            }
            const model = await createProductModel({
                name: modelName.trim(),
                skuPrefix: skuPrefix.trim(),
                categoryId: finalCategoryId,
                organizationId: orgId,
            });
            const matrix = await generateProductMatrix({
                modelId: model.id,
                rowValueIds: colorValues.map((value) => value.id),
                columnValueIds: sizeValues.map((value) => value.id),
                attributeValueIds: brandValues.map((value) => value.id),
                price: Number(price) || 0,
                unit: "шт",
                generateBarcodes: true,
            });
            notify?.({
                type: "success",
                message: `Модель создана: ${matrix.filled} вариантов со штрихкодами`,
            });
            onSaved?.();
            onClose();
        } catch (error) {
            console.error("Unable to create apparel model", error);
            notify?.({
                type: "error",
                message: error instanceof ApiError ? error.message : "Не удалось создать модель одежды",
            });
        } finally {
            setBusy(false);
        }
    };

    const renderValues = (
        label: string,
        attribute: DjangoProductAttribute | undefined,
        value: ValueChoice[],
        onChange: (next: ValueChoice[]) => void,
        icon: React.ReactNode,
        helper: string,
    ) => (
        <Stack spacing={0.75}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{label} *</Typography>
            <Autocomplete<ValueChoice, true, false, true>
                multiple
                freeSolo
                size="small"
                disabled={!attribute || busy}
                options={attribute?.values.filter((item) => item.isActive) ?? []}
                value={value}
                onChange={(_, next) => onChange(next)}
                getOptionLabel={optionLabel}
                isOptionEqualToValue={(option, selected) =>
                    typeof option !== "string" && typeof selected !== "string" && option.id === selected.id
                }
                renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (
                    <Chip {...getTagProps({ index })} key={`${optionLabel(option)}-${index}`} size="small" label={optionLabel(option)} />
                ))}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        placeholder={attribute ? "Выберите или введите новое" : "Сначала добавьте свойство ниже"}
                        helperText={helper}
                        InputProps={{
                            ...params.InputProps,
                            startAdornment: <InputAdornment position="start">{icon}</InputAdornment>,
                        }}
                    />
                )}
            />
        </Stack>
    );

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={busy ? undefined : onClose}
            PaperProps={{ sx: { width: { xs: 320, sm: 520, md: 580 }, maxWidth: "100vw" } }}
        >
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5 }}>
                    <Box>
                        <Typography variant="h6">Модель одежды</Typography>
                        <Typography variant="caption" color="text.secondary">Одна модель создаёт варианты по цветам и размерам.</Typography>
                    </Box>
                    <IconButton onClick={busy ? undefined : onClose} aria-label="Закрыть">
                        <CloseOutlined />
                    </IconButton>
                </Stack>
                <Divider />
                <Box sx={{ p: 2, flex: 1, overflowY: "auto" }}>
                    {loading ? (
                        <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={28} /></Stack>
                    ) : (
                        <Stack spacing={2.5}>
                            <Alert severity="info" variant="outlined">
                                Новые значения, введённые здесь, сохранятся в справочнике и будут доступны для следующих моделей.
                            </Alert>

                            <Stack spacing={1.25}>
                                <Typography variant="subtitle2">Справочники</Typography>
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                                    <TextField
                                        select
                                        label="Тип"
                                        size="small"
                                        value={newAttributeRole}
                                        onChange={(event) => setNewAttributeRole(event.target.value as DjangoProductAttribute["role"])}
                                        sx={{ minWidth: 150 }}
                                        disabled={busy}
                                    >
                                        <MenuItem value="generic">Бренд / свойство</MenuItem>
                                        <MenuItem value="color">Цвет</MenuItem>
                                        <MenuItem value="size">Размерная сетка</MenuItem>
                                    </TextField>
                                    <TextField
                                        size="small"
                                        fullWidth
                                        label="Название свойства"
                                        placeholder={newAttributeRole === "size" ? "Размер EU" : newAttributeRole === "color" ? "Цвет" : "Бренд"}
                                        value={newAttributeName}
                                        onChange={(event) => setNewAttributeName(event.target.value)}
                                        disabled={busy}
                                    />
                                    <Button variant="outlined" startIcon={<AddOutlined />} onClick={() => void handleCreateAttribute()} disabled={busy || !newAttributeName.trim()} sx={{ whiteSpace: "nowrap" }}>
                                        Добавить
                                    </Button>
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                    Для бренда создайте свойство «Бренд». Для размеров брендов с разными сетками заведите отдельные свойства: например, «Размеры Zara».
                                </Typography>
                            </Stack>

                            <Divider />
                            <Stack spacing={1.5}>
                                <Typography variant="subtitle2">Карточка модели</Typography>
                                <TextField
                                    label="Название модели *"
                                    placeholder="Например, Пальто шерстяное oversize"
                                    value={modelName}
                                    onChange={(event) => setModelName(event.target.value)}
                                    disabled={busy}
                                    fullWidth
                                    autoFocus
                                    InputProps={{ startAdornment: <InputAdornment position="start"><GridViewOutlined fontSize="small" /></InputAdornment> }}
                                />
                                <TextField
                                    label="Префикс артикула"
                                    placeholder="MONO-PLT"
                                    value={skuPrefix}
                                    onChange={(event) => setSkuPrefix(event.target.value.toUpperCase())}
                                    disabled={busy}
                                    fullWidth
                                    helperText="Варианты получат артикулы вида MONO-PLT-BLK-42."
                                />
                                <TextField select label="Категория" size="small" value={categoryId ?? ""} onChange={(event) => setCategoryId(event.target.value === "" ? null : Number(event.target.value))} disabled={busy} fullWidth>
                                    <MenuItem value="">Без категории</MenuItem>
                                    {categories.filter((category) => category.isActive).map((category) => (
                                        <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
                                    ))}
                                </TextField>
                                <TextField
                                    label="или новая категория"
                                    size="small"
                                    value={newCategoryName}
                                    onChange={(event) => setNewCategoryName(event.target.value)}
                                    disabled={busy}
                                    helperText="Например, Верхняя одежда. Она будет создана при сохранении модели."
                                />
                            </Stack>

                            <Divider />
                            <Stack spacing={1.5}>
                                <Typography variant="subtitle2">Варианты</Typography>
                                <TextField select label="Свойство бренда" size="small" value={brandAttributeId ?? ""} onChange={(event) => { setBrandAttributeId(event.target.value === "" ? null : Number(event.target.value)); setBrand(null); }} disabled={busy} fullWidth>
                                    <MenuItem value="">Не указывать</MenuItem>
                                    {genericAttributes.map((attribute) => <MenuItem key={attribute.id} value={attribute.id}>{attribute.name}</MenuItem>)}
                                </TextField>
                                {brandAttribute && (
                                    <Autocomplete<ValueChoice, false, false, true>
                                        freeSolo
                                        size="small"
                                        options={brandAttribute.values.filter((item) => item.isActive)}
                                        value={brand}
                                        onChange={(_, next) => setBrand(next)}
                                        getOptionLabel={optionLabel}
                                        isOptionEqualToValue={(option, selected) => typeof option !== "string" && typeof selected !== "string" && option.id === selected.id}
                                        renderInput={(params) => <TextField {...params} label={brandAttribute.name} placeholder="Выберите или введите новый бренд" InputProps={{ ...params.InputProps, startAdornment: <InputAdornment position="start"><LabelOutlined fontSize="small" /></InputAdornment> }} />}
                                    />
                                )}
                                {renderValues("Цвета", colorAttribute, colors, setColors, <PaletteOutlined fontSize="small" />, "Например: чёрный, бежевый. Каждый цвет станет строкой матрицы.")}
                                {renderValues("Размеры", sizeAttribute, sizes, setSizes, <StraightenOutlined fontSize="small" />, "Например: S, M, L или 42, 44, 46. Порядок сохраняется в порядке добавления.")}
                                <TextField
                                    label="Цена продажи, сом"
                                    size="small"
                                    type="number"
                                    value={price}
                                    onChange={(event) => setPrice(event.target.value)}
                                    disabled={busy}
                                    InputProps={{ inputProps: { min: 0 } }}
                                />
                            </Stack>
                        </Stack>
                    )}
                </Box>
                <Divider />
                <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ p: 2 }}>
                    <Button onClick={onClose} disabled={busy}>Отмена</Button>
                    <Button
                        variant="contained"
                        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlined />}
                        onClick={() => void handleCreateModel()}
                        disabled={busy || loading || !modelName.trim() || !colorAttribute || !sizeAttribute || colors.length === 0 || sizes.length === 0}
                    >
                        Создать матрицу
                    </Button>
                </Stack>
            </Box>
        </Drawer>
    );
};

