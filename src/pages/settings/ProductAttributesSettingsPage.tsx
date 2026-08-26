import React from "react";
import {
    Alert, Box, Button, Chip, CircularProgress, Divider, Drawer, IconButton,
    MenuItem, Paper, Stack, Switch, TextField, Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PaletteOutlined from "@mui/icons-material/PaletteOutlined";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import LabelOutlined from "@mui/icons-material/LabelOutlined";
import { useNotification } from "@refinedev/core";

import { ApiError } from "../../api/client";
import {
    createProductAttribute, createProductAttributeValue, getProductAttributes,
    type DjangoProductAttribute, updateProductAttribute,
} from "../../api/warehouse";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";

type Role = DjangoProductAttribute["role"];
const roleInfo: Record<Role, { title: string; description: string; icon: React.ReactNode }> = {
    generic: { title: "Обычное поле", description: "Бренд, материал, сезон, коллекция и другие поля карточки товара.", icon: <LabelOutlined fontSize="small" /> },
    color: { title: "Цвет", description: "Создаёт строки матрицы вариантов.", icon: <PaletteOutlined fontSize="small" /> },
    size: { title: "Размерная сетка", description: "Создаёт столбцы матрицы; порядок значений сохраняется.", icon: <StraightenOutlined fontSize="small" /> },
};

type EditorProps = {
    item: DjangoProductAttribute | null;
    open: boolean;
    onClose: () => void;
    onChanged: () => void;
    organizationId?: number;
};

const AttributeEditor: React.FC<EditorProps> = ({ item, open, onClose, onChanged, organizationId }) => {
    const { open: notify } = useNotification();
    const [name, setName] = React.useState("");
    const [role, setRole] = React.useState<Role>("generic");
    const [valuesText, setValuesText] = React.useState("");
    const [active, setActive] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    React.useEffect(() => {
        if (!open) return;
        setName(item?.name ?? ""); setRole(item?.role ?? "generic"); setValuesText(""); setActive(item?.isActive ?? true); setBusy(false);
    }, [item, open]);
    const save = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            const attribute = item
                ? await updateProductAttribute(item.id, { name: name.trim(), isActive: active })
                : await createProductAttribute({ name: name.trim(), role, organizationId });
            const known = new Set((item?.values ?? []).map((value) => value.value.toLocaleLowerCase()));
            const additions = [...new Set(valuesText.split(",").map((value) => value.trim()).filter(Boolean))];
            for (const value of additions) {
                if (!known.has(value.toLocaleLowerCase())) await createProductAttributeValue(attribute.id, { value });
            }
            notify?.({ type: "success", message: item ? "Свойство обновлено" : "Свойство добавлено" });
            onChanged(); onClose();
        } catch (error) {
            notify?.({ type: "error", message: error instanceof ApiError ? error.message : "Не удалось сохранить свойство" });
        } finally { setBusy(false); }
    };
    return <Drawer anchor="right" open={open} onClose={busy ? undefined : onClose}
        PaperProps={{ sx: { width: { xs: 360, sm: 480 }, maxWidth: "100vw" } }}>
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2 }}>
                <Box><Typography variant="h6">{item ? "Настроить свойство" : "Новое свойство"}</Typography><Typography variant="caption" color="text.secondary">Это поле автоматически появится в дровере товара.</Typography></Box>
                <IconButton onClick={onClose} disabled={busy}><CloseOutlined /></IconButton>
            </Stack><Divider />
            <Stack spacing={2} sx={{ p: 2, flex: 1 }}>
                <TextField label="Название *" size="small" value={name} autoFocus disabled={busy} onChange={(e) => setName(e.target.value)} placeholder={role === "size" ? "Размер EU" : role === "color" ? "Цвет" : "Бренд"} />
                <TextField select label="Тип поля" size="small" value={role} disabled={busy || Boolean(item)} onChange={(e) => setRole(e.target.value as Role)}>
                    {(Object.keys(roleInfo) as Role[]).map((key) => <MenuItem key={key} value={key}><Stack><Typography variant="body2">{roleInfo[key].title}</Typography><Typography variant="caption" color="text.secondary">{roleInfo[key].description}</Typography></Stack></MenuItem>)}
                </TextField>
                <TextField label="Добавить значения" size="small" multiline minRows={2} value={valuesText} disabled={busy} onChange={(e) => setValuesText(e.target.value)} placeholder={role === "size" ? "S, M, L, XL" : role === "color" ? "Чёрный, Бежевый" : "Monogram, ..."} helperText="Введите через запятую. Для размеров порядок будет таким же, как здесь." />
                {item && <Paper variant="outlined" sx={{ p: 1.25, display: "flex", alignItems: "center", justifyContent: "space-between" }}><Box><Typography variant="body2">Показывать в форме</Typography><Typography variant="caption" color="text.secondary">Выключенное свойство останется в истории, но исчезнет из новых форм.</Typography></Box><Switch checked={active} onChange={(e) => setActive(e.target.checked)} disabled={busy} /></Paper>}
                {item && item.values.length > 0 && <Stack spacing={0.75}><Typography variant="caption" color="text.secondary">Текущие значения</Typography><Stack direction="row" gap={0.75} flexWrap="wrap">{item.values.map((value) => <Chip key={value.id} size="small" label={value.value} variant={value.isActive ? "filled" : "outlined"} />)}</Stack></Stack>}
            </Stack><Divider />
            <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ p: 2 }}><Button onClick={onClose} disabled={busy}>Отмена</Button><Button variant="contained" disabled={busy || !name.trim()} onClick={() => void save()} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>{busy ? "Сохранение…" : "Сохранить"}</Button></Stack>
        </Box>
    </Drawer>;
};

const ProductAttributesSettingsPage: React.FC = () => {
    const { open: notify } = useNotification();
    const orgId = useApiOrgId();
    const { activeOrganization, loading: permissionsLoading } = usePermissions();
    const [items, setItems] = React.useState<DjangoProductAttribute[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [editorItem, setEditorItem] = React.useState<DjangoProductAttribute | null | undefined>(undefined);
    const load = React.useCallback(async () => {
        if (activeOrganization?.vertical !== "retail") return;
        setLoading(true);
        try { setItems(await getProductAttributes(undefined, orgId)); }
        catch (error) { notify?.({ type: "error", message: error instanceof ApiError ? error.message : "Не удалось загрузить свойства" }); }
        finally { setLoading(false); }
    }, [activeOrganization?.vertical, notify, orgId]);
    React.useEffect(() => { void load(); }, [load]);
    return <SettingsLayout><Stack spacing={3}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap"><Box><Typography variant="h6" fontWeight={600}>Свойства товара</Typography><Typography variant="body2" color="text.secondary">Соберите поля единого дровера: бренд, материал, сезон, цвета и размерные сетки.</Typography></Box><Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setEditorItem(null)} disabled={loading || permissionsLoading}>Добавить свойство</Button></Stack>
        {activeOrganization && activeOrganization.vertical !== "retail" && <Alert severity="info">Настройка вариантов доступна организациям с вертикалью «Розничная торговля».</Alert>}
        {loading && <Stack alignItems="center" py={5}><CircularProgress size={26} /></Stack>}
        {!loading && activeOrganization?.vertical === "retail" && !items.length && <Alert severity="info">Сначала создайте «Бренд», «Цвет» и «Размер EU». После этого форма «Добавить товар» сможет создавать обычные товары и варианты одежды.</Alert>}
        <Stack spacing={1.25}>{items.map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}><Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1.5}><Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}><Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">{roleInfo[item.role].icon}<Typography fontWeight={600}>{item.name}</Typography><Chip size="small" label={roleInfo[item.role].title} variant="outlined" /><Chip size="small" label={item.isActive ? "В форме" : "Скрыто"} color={item.isActive ? "success" : "default"} variant="outlined" /></Stack><Typography variant="caption" color="text.secondary">{roleInfo[item.role].description}</Typography>{item.values.length > 0 && <Stack direction="row" gap={0.75} flexWrap="wrap">{item.values.map((value) => <Chip key={value.id} size="small" label={value.value} variant={value.isActive ? "filled" : "outlined"} />)}</Stack>}</Stack><IconButton size="small" onClick={() => setEditorItem(item)}><EditOutlined fontSize="small" /></IconButton></Stack></Paper>)}</Stack>
        <AttributeEditor open={editorItem !== undefined} item={editorItem ?? null} onClose={() => setEditorItem(undefined)} onChanged={() => void load()} organizationId={orgId} />
    </Stack></SettingsLayout>;
};

export default ProductAttributesSettingsPage;
