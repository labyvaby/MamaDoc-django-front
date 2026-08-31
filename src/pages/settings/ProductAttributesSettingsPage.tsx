import React from "react";
import {
    Alert,
    Box,
    Button,
    Divider,
    Drawer,
    IconButton,
    InputAdornment,
    MenuItem,
    Skeleton,
    Switch,
    TextField,
    Typography,
    alpha,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import { useNotification } from "@refinedev/core";

import { ApiError } from "../../api/client";
import {
    createProductAttribute,
    createProductAttributeValue,
    createProductCategory,
    deleteProductAttributeValue,
    getProductAttributes,
    getProductCategoryTree,
    updateProductAttribute,
    updateProductCategory,
    type DjangoProductAttribute,
    type DjangoProductAttributeValueOption,
    type DjangoProductCategoryNode,
} from "../../api/warehouse";
import { AppBottomSheet } from "../../components/ui/AppBottomSheet";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { usePermissions } from "../../hooks/usePermissions";
import { SettingsLayout } from "./SettingsLayout";

/* ────────────────────────────────────────────────────────────────────────────
 * «Верстак»: категории — карточки с живым превью формы товара, справа липкая
 * библиотека полей.  Наведение на поле подсвечивает категории, где оно
 * используется, и наоборот — так видно связь, которой в плоских списках не
 * было.
 *
 * Раскладка управляется CSS container queries по контейнеру `attrs`, а НЕ
 * по ширине окна: страница живёт внутри SettingsLayout, который забирает
 * 240px под колонку вкладок, поэтому брейкпоинты вьюпорта здесь врут.
 * ──────────────────────────────────────────────────────────────────────── */

const CQ = "attrs";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

type Role = DjangoProductAttribute["role"];

const roleInfo: Record<Role, { title: string; description: string }> = {
    generic: {
        title: "Обычное поле",
        description: "Бренд, материал, сезон, коллекция и другие поля товара.",
    },
    color: {
        title: "Цвет",
        description: "Вместе с размером создаёт варианты товара.",
    },
    size: {
        title: "Размерная сетка",
        description: "Вместе с цветом создаёт варианты товара.",
    },
};

/** Токены дизайна, которых нет в теме: роли полей, статус матрицы, подложки. */
function useTones() {
    const theme = useTheme();
    const dark = theme.palette.mode === "dark";
    return React.useMemo(
        () => ({
            role: {
                color: dark ? "#C084FC" : "#9333EA",
                size: dark ? "#F5A524" : "#C2410C",
                generic: dark ? "#94A3B8" : "#5C6B85",
            } as Record<Role, string>,
            matrix: dark ? "#2DD4BF" : "#0D8A80",
            ok: dark ? "#4ADE80" : "#16A34A",
            /** Утопленная подложка: поиск, рейл, базовые строки формы. */
            soft: dark ? alpha("#FFFFFF", 0.045) : alpha("#0B0A10", 0.035),
            /** Подложка чипов значений. */
            soft2: dark ? alpha("#FFFFFF", 0.085) : alpha("#0B0A10", 0.06),
            lineSoft: dark ? alpha("#FFFFFF", 0.05) : alpha("#0B0A10", 0.05),
        }),
        [dark],
    );
}

/* ── цвет образца ─────────────────────────────────────────────────────────
 * У значения атрибута в API нет hex — есть только `value` и служебный `code`.
 * Поэтому образец берём из hex в `code` (если админ его туда положил), иначе
 * из словаря названий, иначе — детерминированный оттенок из строки, чтобы
 * одно и то же значение всегда красилось одинаково.
 * ──────────────────────────────────────────────────────────────────────── */
const COLOR_NAMES: Array<[string, string]> = [
    ["чёрн", "#1B1B1F"],
    ["черн", "#1B1B1F"],
    ["black", "#1B1B1F"],
    ["бел", "#F2F2F4"],
    ["white", "#F2F2F4"],
    ["молочн", "#F2EAD9"],
    ["кремов", "#EFE3CC"],
    ["беж", "#D9C7A7"],
    ["beige", "#D9C7A7"],
    ["хаки", "#6B6B3F"],
    ["khaki", "#6B6B3F"],
    ["сер", "#8A8A93"],
    ["gray", "#8A8A93"],
    ["grey", "#8A8A93"],
    ["серебр", "#C0C4C9"],
    ["золот", "#C8A951"],
    ["бордов", "#7C2B3B"],
    ["красн", "#D02B2B"],
    ["red", "#D02B2B"],
    ["розов", "#E58FB0"],
    ["pink", "#E58FB0"],
    ["оранж", "#E07B39"],
    ["orange", "#E07B39"],
    ["жёлт", "#E5B800"],
    ["желт", "#E5B800"],
    ["yellow", "#E5B800"],
    ["зелён", "#2F9E44"],
    ["зелен", "#2F9E44"],
    ["green", "#2F9E44"],
    ["мятн", "#8FD6C0"],
    ["бирюз", "#2EC4B6"],
    ["голуб", "#4AA8E0"],
    ["син", "#2B5BD0"],
    ["blue", "#2B5BD0"],
    ["фиолет", "#7C4DBD"],
    ["purple", "#7C4DBD"],
    ["сирен", "#B39DDB"],
    ["коричн", "#7A5230"],
    ["brown", "#7A5230"],
];

const HEX_RE = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

function swatchOf(value: string, code?: string): string {
    if (code && HEX_RE.test(code)) return code.startsWith("#") ? code : `#${code}`;
    const key = value.trim().toLowerCase();
    const hit = COLOR_NAMES.find(([name]) => key.includes(name));
    if (hit) return hit[1];
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 360;
    return `hsl(${hash} 42% 55%)`;
}

/** «3 значения» / «1 значение» / «нет значений». */
function pluralValues(count: number): string {
    if (count === 0) return "нет значений";
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return `${count} значение`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} значения`;
    return `${count} значений`;
}

function pluralFields(count: number): string {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return `${count} поле`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} поля`;
    return `${count} полей`;
}

function pluralVariants(count: number): string {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return `${count} вариант`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} варианта`;
    return `${count} вариантов`;
}

/* ── мелкие примитивы ───────────────────────────────────────────────────── */

const RoleDot: React.FC<{ role: Role }> = ({ role }) => {
    const tones = useTones();
    return (
        <Box
            component="span"
            sx={{ width: 7, height: 7, borderRadius: "2px", flex: "none", bgcolor: tones.role[role] }}
        />
    );
};

const Meter: React.FC<{ value: number; label: string; accent?: string }> = ({ value, label, accent }) => {
    const tones = useTones();
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "baseline",
                gap: "7px",
                px: "12px",
                py: "7px",
                border: 1,
                borderColor: "divider",
                borderRadius: "9px",
                bgcolor: tones.soft,
            }}
        >
            <Box
                component="b"
                sx={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: accent }}
            >
                {value}
            </Box>
            <Box component="span" sx={{ fontSize: 12, color: "text.disabled" }}>
                {label}
            </Box>
        </Box>
    );
};

const GroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography
        sx={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "text.disabled",
            mt: "2px",
        }}
    >
        {children}
    </Typography>
);

const ValueChip: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({ children, muted }) => {
    const tones = useTones();
    return (
        <Box
            component="span"
            sx={{
                fontFamily: MONO,
                fontSize: 11,
                lineHeight: 1.5,
                px: "7px",
                py: "2px",
                borderRadius: "6px",
                bgcolor: tones.soft2,
                color: muted ? "text.disabled" : "text.secondary",
                whiteSpace: "nowrap",
            }}
        >
            {children}
        </Box>
    );
};

const Swatch: React.FC<{ value: string; code?: string; size?: number }> = ({ value, code, size = 19 }) => {
    const theme = useTheme();
    const ring = theme.palette.mode === "dark" ? alpha("#FFFFFF", 0.22) : alpha("#0B0A10", 0.18);
    return (
        <Box
            component="span"
            title={value}
            sx={{
                width: size,
                height: size,
                borderRadius: "6px",
                flex: "none",
                bgcolor: swatchOf(value, code),
                boxShadow: `inset 0 0 0 1px ${ring}`,
            }}
        />
    );
};

/** Значения поля: цвет — образцами, остальное — моно-чипами. Хвост сворачиваем. */
const ValuePreview: React.FC<{ attribute: DjangoProductAttribute; limit?: number }> = ({
    attribute,
    limit = 6,
}) => {
    const shown = attribute.values.slice(0, limit);
    const rest = attribute.values.length - shown.length;
    if (!attribute.values.length) return null;
    return (
        <Box sx={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "center" }}>
            {shown.map((value) =>
                attribute.role === "color" ? (
                    <Swatch key={value.id} value={value.value} code={value.code} />
                ) : (
                    <ValueChip key={value.id} muted={!value.isActive}>
                        {value.value}
                    </ValueChip>
                ),
            )}
            {rest > 0 && <ValueChip muted>+{rest}</ValueChip>}
        </Box>
    );
};

const StatusPill: React.FC<{ children: React.ReactNode; tone?: string }> = ({ children, tone }) => (
    <Box
        component="span"
        sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            px: "9px",
            py: "3px",
            borderRadius: "999px",
            fontSize: 11.5,
            lineHeight: 1.5,
            fontWeight: tone ? 500 : 400,
            whiteSpace: "nowrap",
            border: 1,
            borderColor: tone ? alpha(tone, 0.38) : "divider",
            bgcolor: tone ? alpha(tone, 0.12) : "transparent",
            color: tone ?? "text.disabled",
        }}
    >
        {children}
    </Box>
);

/* ── превью формы товара внутри карточки категории ──────────────────────── */

const PreviewRow: React.FC<{
    label: string;
    base?: boolean;
    right?: React.ReactNode;
}> = ({ label, base, right }) => {
    const tones = useTones();
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                px: "10px",
                py: "7px",
                borderRadius: "8px",
                fontSize: 12.5,
                minWidth: 0,
                border: 1,
                ...(base
                    ? { bgcolor: tones.soft, borderColor: tones.lineSoft, opacity: 0.5 }
                    : { bgcolor: "background.paper", borderColor: "divider" }),
            }}
        >
            <Box
                component="span"
                sx={{
                    color: base ? "text.secondary" : "text.primary",
                    fontWeight: base ? 400 : 500,
                    whiteSpace: "nowrap",
                }}
            >
                {label}
            </Box>
            <Box sx={{ ml: "auto", display: "flex", minWidth: 0, justifyContent: "flex-end" }}>
                {right ?? (
                    <Box sx={{ width: 52, height: 6, borderRadius: "3px", bgcolor: "divider" }} />
                )}
            </Box>
        </Box>
    );
};

const FormPreview: React.FC<{ fields: DjangoProductAttribute[] }> = ({ fields }) => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 }}>
        <Typography
            sx={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: "0.11em",
                textTransform: "uppercase",
                color: "text.disabled",
                mb: "2px",
            }}
        >
            Форма товара
        </Typography>
        <PreviewRow label="Название" base />
        <PreviewRow label="Цена" base />
        {fields.map((field) => (
            <PreviewRow
                key={field.id}
                label={field.name}
                right={
                    <Box sx={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                        <RoleDot role={field.role} />
                        <ValuePreview attribute={field} limit={4} />
                    </Box>
                }
            />
        ))}
    </Box>
);

/* ── карточка категории ─────────────────────────────────────────────────── */

type CardState = "idle" | "lit" | "dim";

const CategoryCard: React.FC<{
    category: DjangoProductCategoryNode;
    fields: DjangoProductAttribute[];
    state: CardState;
    onOpen: () => void;
    onHover: (on: boolean) => void;
}> = ({ category, fields, state, onOpen, onHover }) => {
    const theme = useTheme();
    const tones = useTones();
    const valueCount = fields.reduce((sum, field) => sum + field.values.length, 0);
    const colorField = fields.find((field) => field.role === "color");
    const sizeField = fields.find((field) => field.role === "size");
    const variants =
        colorField && sizeField ? colorField.values.length * sizeField.values.length : 0;

    return (
        <Box
            component="button"
            type="button"
            onClick={onOpen}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
            onFocus={() => onHover(true)}
            onBlur={() => onHover(false)}
            sx={{
                appearance: "none",
                font: "inherit",
                color: "inherit",
                textAlign: "left",
                width: "100%",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: "11px",
                p: "14px",
                borderRadius: "12px",
                bgcolor: "background.paper",
                border: 1,
                borderColor: state === "lit" ? "primary.main" : "divider",
                boxShadow: state === "lit" ? `0 0 0 1px ${theme.palette.primary.main}` : "none",
                opacity: state === "dim" ? 0.34 : category.isActive ? 1 : 0.62,
                transition: "border-color .16s, opacity .16s, box-shadow .16s",
                "&:hover": { borderColor: alpha(theme.palette.primary.main, 0.4) },
                "@media (prefers-reduced-motion: reduce)": { transition: "none" },
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                <Box
                    component="span"
                    sx={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        flex: "none",
                        bgcolor: category.isActive ? tones.ok : "text.disabled",
                    }}
                />
                <Typography
                    component="h3"
                    sx={{ fontSize: 15, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}
                >
                    {category.name}
                </Typography>
                {variants > 0 && (
                    <StatusPill tone={tones.matrix}>
                        <GridViewOutlined sx={{ fontSize: 12 }} />
                        {pluralVariants(variants)}
                    </StatusPill>
                )}
                {!category.isActive && <StatusPill>Скрыта</StatusPill>}
                <EditOutlined
                    sx={{ ml: "auto", fontSize: 17, flex: "none", color: "text.disabled" }}
                />
            </Box>

            {fields.length ? (
                <FormPreview fields={fields} />
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    <Typography
                        sx={{
                            fontFamily: MONO,
                            fontSize: 10,
                            letterSpacing: "0.11em",
                            textTransform: "uppercase",
                            color: "text.disabled",
                            mb: "2px",
                        }}
                    >
                        Форма товара
                    </Typography>
                    <PreviewRow label="Название" base />
                    <PreviewRow label="Цена" base />
                    <Box
                        sx={{
                            p: "11px",
                            border: "1px dashed",
                            borderColor: "divider",
                            borderRadius: "8px",
                            textAlign: "center",
                            fontSize: 12,
                            color: "text.disabled",
                        }}
                    >
                        Только базовые поля — соберите форму категории
                    </Box>
                </Box>
            )}

            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexWrap: "wrap",
                    fontSize: 11.5,
                    color: "text.disabled",
                    pt: "9px",
                    width: "100%",
                    borderTop: 1,
                    borderColor: tones.lineSoft,
                }}
            >
                <span>{fields.length ? pluralFields(fields.length) : "без своих полей"}</span>
                {valueCount > 0 && (
                    <>
                        <span>·</span>
                        <span>{pluralValues(valueCount)}</span>
                    </>
                )}
                <span>·</span>
                <span>{category.isActive ? "активна" : "скрыта"}</span>
            </Box>
        </Box>
    );
};

/* ── карточка поля в библиотеке ─────────────────────────────────────────── */

const FieldCard: React.FC<{
    attribute: DjangoProductAttribute;
    usedIn: string[];
    state: CardState;
    onOpen: () => void;
    onHover: (on: boolean) => void;
}> = ({ attribute, usedIn, state, onOpen, onHover }) => {
    const theme = useTheme();
    const tones = useTones();
    return (
        <Box
            component="button"
            type="button"
            onClick={onOpen}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
            onFocus={() => onHover(true)}
            onBlur={() => onHover(false)}
            sx={{
                appearance: "none",
                font: "inherit",
                color: "inherit",
                textAlign: "left",
                width: "100%",
                cursor: "pointer",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: "7px",
                pl: "14px",
                pr: "12px",
                py: "11px",
                borderRadius: "10px",
                bgcolor: "background.paper",
                border: 1,
                borderColor: state === "lit" ? "primary.main" : "divider",
                boxShadow: state === "lit" ? `0 0 0 1px ${theme.palette.primary.main}` : "none",
                opacity: state === "dim" ? 0.34 : attribute.isActive ? 1 : 0.62,
                transition: "border-color .16s, opacity .16s, box-shadow .16s",
                "&:hover": { borderColor: alpha(theme.palette.primary.main, 0.4) },
                "&::before": {
                    content: '""',
                    position: "absolute",
                    left: 0,
                    top: 11,
                    bottom: 11,
                    width: 3,
                    borderRadius: "0 3px 3px 0",
                    bgcolor: tones.role[attribute.role],
                },
                "@media (prefers-reduced-motion: reduce)": { transition: "none" },
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: "7px", width: "100%" }}>
                <RoleDot role={attribute.role} />
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>
                    {attribute.name}
                </Typography>
                <Box
                    component="span"
                    sx={{ ml: "auto", fontSize: 11, color: "text.disabled", whiteSpace: "nowrap" }}
                >
                    {attribute.isActive ? pluralValues(attribute.values.length) : "скрыто"}
                </Box>
            </Box>

            <ValuePreview attribute={attribute} />

            {usedIn.length ? (
                <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                    в категориях:{" "}
                    <Box component="b" sx={{ color: "text.secondary", fontWeight: 500 }}>
                        {usedIn.join(", ")}
                    </Box>
                </Typography>
            ) : (
                <Typography sx={{ fontSize: 11, color: tones.role.size }}>
                    не используется ни в одной категории
                </Typography>
            )}
        </Box>
    );
};

/* ── общая оболочка редактора: справа на десктопе, лист снизу на мобиле ── */

const EditorShell: React.FC<{
    open: boolean;
    onClose: () => void;
    title: string;
    caption: string;
    busy: boolean;
    footer: React.ReactNode;
    width: number;
    children: React.ReactNode;
}> = ({ open, onClose, title, caption, busy, footer, width, children }) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));

    const head = (
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, p: 2 }}>
            <Box>
                <Typography sx={{ fontSize: 17, fontWeight: 600 }}>{title}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.disabled", mt: "2px" }}>{caption}</Typography>
            </Box>
            {!isMobile && (
                <IconButton onClick={onClose} disabled={busy} size="small">
                    <CloseOutlined fontSize="small" />
                </IconButton>
            )}
        </Box>
    );

    const body = (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "14px", px: 2, pb: 2 }}>{children}</Box>
    );

    const foot = (
        <Box
            sx={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 1,
                p: 2,
                borderTop: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
            }}
        >
            {footer}
        </Box>
    );

    if (isMobile) {
        return (
            <AppBottomSheet open={open} onClose={busy ? () => undefined : onClose} fullHeight header={head}>
                <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
                    <Divider />
                    <Box sx={{ flex: 1, pt: "14px" }}>{body}</Box>
                    {foot}
                </Box>
            </AppBottomSheet>
        );
    }

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={busy ? undefined : onClose}
            PaperProps={{ sx: { width: { xs: "100vw", sm: width }, maxWidth: "100vw" } }}
        >
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                {head}
                <Divider />
                <Box sx={{ flex: 1, overflowY: "auto", pt: "14px" }}>{body}</Box>
                {foot}
            </Box>
        </Drawer>
    );
};

/* ── редактор поля ──────────────────────────────────────────────────────── */

type AttributeEditorProps = {
    item: DjangoProductAttribute | null;
    open: boolean;
    onClose: () => void;
    onChanged: () => void;
    organizationId?: number;
};

const AttributeEditor: React.FC<AttributeEditorProps> = ({
    item,
    open,
    onClose,
    onChanged,
    organizationId,
}) => {
    const { open: notify } = useNotification();
    const tones = useTones();
    const [name, setName] = React.useState("");
    const [role, setRole] = React.useState<Role>("generic");
    const [valuesText, setValuesText] = React.useState("");
    const [removed, setRemoved] = React.useState<number[]>([]);
    const [active, setActive] = React.useState(true);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        if (!open) return;
        setName(item?.name ?? "");
        setRole(item?.role ?? "generic");
        setValuesText("");
        setRemoved([]);
        setActive(item?.isActive ?? true);
        setBusy(false);
    }, [item, open]);

    const toggleRemoved = (id: number) =>
        setRemoved((current) =>
            current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
        );

    const save = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            const attribute = item
                ? await updateProductAttribute(item.id, { name: name.trim(), isActive: active })
                : await createProductAttribute({ name: name.trim(), role, organizationId });
            const known = new Set((item?.values ?? []).map((value) => value.value.toLowerCase()));
            const fresh = [...new Set(valuesText.split(",").map((value) => value.trim()).filter(Boolean))];
            for (const value of fresh) {
                if (!known.has(value.toLowerCase())) {
                    await createProductAttributeValue(attribute.id, { value });
                }
            }
            for (const id of removed) await deleteProductAttributeValue(id);
            notify?.({ type: "success", message: item ? "Поле обновлено" : "Поле добавлено" });
            onChanged();
            onClose();
        } catch (error) {
            notify?.({
                type: "error",
                message: error instanceof ApiError ? error.message : "Не удалось сохранить поле",
            });
        } finally {
            setBusy(false);
        }
    };

    const placeholder =
        role === "size" ? "S, M, L, XL" : role === "color" ? "Чёрный, Бежевый" : "Monogram, Хлопок";

    return (
        <EditorShell
            open={open}
            onClose={onClose}
            busy={busy}
            width={480}
            title={item ? "Настроить поле" : "Новое поле"}
            caption="Поле можно включить в нужные категории."
            footer={
                <>
                    <Button onClick={onClose} disabled={busy}>
                        Отмена
                    </Button>
                    <Button variant="contained" disabled={busy || !name.trim()} onClick={() => void save()}>
                        {busy ? "Сохранение…" : "Сохранить"}
                    </Button>
                </>
            }
        >
            <TextField
                label="Название *"
                size="small"
                autoFocus
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
            />
            <TextField
                select
                label="Тип"
                size="small"
                value={role}
                disabled={busy || Boolean(item)}
                onChange={(event) => setRole(event.target.value as Role)}
                helperText={roleInfo[role].description}
            >
                {(Object.keys(roleInfo) as Role[]).map((key) => (
                    <MenuItem key={key} value={key}>
                        {roleInfo[key].title}
                    </MenuItem>
                ))}
            </TextField>

            {Boolean(item?.values.length) && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <GroupLabel>Текущие значения</GroupLabel>
                    <Box sx={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {(item?.values ?? []).map((value: DjangoProductAttributeValueOption) => {
                            const gone = removed.includes(value.id);
                            return (
                                <Box
                                    key={value.id}
                                    component="button"
                                    type="button"
                                    disabled={busy}
                                    onClick={() => toggleRemoved(value.id)}
                                    title={gone ? "Вернуть значение" : "Удалить значение"}
                                    sx={{
                                        appearance: "none",
                                        font: "inherit",
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        px: "8px",
                                        py: "4px",
                                        borderRadius: "8px",
                                        border: 1,
                                        borderColor: gone ? "divider" : "transparent",
                                        bgcolor: gone ? "transparent" : tones.soft2,
                                        color: gone ? "text.disabled" : "text.primary",
                                        textDecoration: gone ? "line-through" : "none",
                                        fontSize: 12,
                                    }}
                                >
                                    {item?.role === "color" && (
                                        <Swatch value={value.value} code={value.code} size={14} />
                                    )}
                                    {value.value}
                                    <CloseOutlined sx={{ fontSize: 13, opacity: 0.6 }} />
                                </Box>
                            );
                        })}
                    </Box>
                    {removed.length > 0 && (
                        <Typography sx={{ fontSize: 11.5, color: tones.role.size }}>
                            {pluralValues(removed.length)} будет удалено при сохранении.
                        </Typography>
                    )}
                </Box>
            )}

            <TextField
                label="Добавить значения"
                size="small"
                multiline
                minRows={2}
                value={valuesText}
                disabled={busy}
                onChange={(event) => setValuesText(event.target.value)}
                placeholder={placeholder}
                helperText="Через запятую. Для размерной сетки порядок сохранится."
            />

            {item && (
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 1,
                        p: "12px",
                        border: 1,
                        borderColor: "divider",
                        borderRadius: "10px",
                        bgcolor: tones.soft,
                    }}
                >
                    <Box>
                        <Typography sx={{ fontSize: 13 }}>Поле активно</Typography>
                        <Typography sx={{ fontSize: 11.5, color: "text.disabled" }}>
                            Отключённые поля не показываются в новых формах.
                        </Typography>
                    </Box>
                    <Switch
                        checked={active}
                        disabled={busy}
                        onChange={(event) => setActive(event.target.checked)}
                    />
                </Box>
            )}
        </EditorShell>
    );
};

/* ── редактор категории ─────────────────────────────────────────────────── */

type CategoryEditorProps = {
    item: DjangoProductCategoryNode | null;
    attributes: DjangoProductAttribute[];
    categories: DjangoProductCategoryNode[];
    open: boolean;
    onClose: () => void;
    onChanged: () => void;
    organizationId?: number;
};

const CategoryEditor: React.FC<CategoryEditorProps> = ({
    item,
    attributes,
    categories,
    open,
    onClose,
    onChanged,
    organizationId,
}) => {
    const { open: notify } = useNotification();
    const theme = useTheme();
    const tones = useTones();
    const [name, setName] = React.useState("");
    const [parentId, setParentId] = React.useState<number | null>(null);
    const [attributeIds, setAttributeIds] = React.useState<number[]>([]);
    const [active, setActive] = React.useState(true);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        if (!open) return;
        setName(item?.name ?? "");
        setParentId(item?.parentId ?? null);
        setAttributeIds(item?.attributeIds ?? []);
        setActive(item?.isActive ?? true);
        setBusy(false);
    }, [item, open]);

    const toggle = (id: number) =>
        setAttributeIds((current) =>
            current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
        );

    const picked = attributes.filter((attribute) => attributeIds.includes(attribute.id));
    const colorField = picked.find((attribute) => attribute.role === "color");
    const sizeField = picked.find((attribute) => attribute.role === "size");
    const hasColor = Boolean(colorField);
    const hasSize = Boolean(sizeField);
    const variants =
        colorField && sizeField ? colorField.values.length * sizeField.values.length : 0;

    const save = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            if (item) {
                await updateProductCategory(item.id, {
                    name: name.trim(),
                    parentId: parentId ?? undefined,
                    clearParent: item.parentId != null && parentId == null,
                    attributeIds,
                    isActive: active,
                });
            } else {
                await createProductCategory({
                    name: name.trim(),
                    parentId: parentId ?? undefined,
                    attributeIds,
                    organizationId,
                });
            }
            notify?.({ type: "success", message: item ? "Категория обновлена" : "Категория добавлена" });
            onChanged();
            onClose();
        } catch (error) {
            notify?.({
                type: "error",
                message: error instanceof ApiError ? error.message : "Не удалось сохранить категорию",
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <EditorShell
            open={open}
            onClose={onClose}
            busy={busy}
            width={520}
            title={item ? "Настроить категорию" : "Новая категория"}
            caption="Отметьте, какие поля увидит сотрудник после выбора категории."
            footer={
                <>
                    <Button onClick={onClose} disabled={busy}>
                        Отмена
                    </Button>
                    <Button
                        variant="contained"
                        disabled={busy || !name.trim() || hasColor !== hasSize}
                        onClick={() => void save()}
                    >
                        {busy ? "Сохранение…" : "Сохранить"}
                    </Button>
                </>
            }
        >
            <TextField
                label="Название категории *"
                size="small"
                autoFocus
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                placeholder="Одежда"
            />
            <TextField
                select
                label="Родительская категория"
                size="small"
                value={parentId ?? ""}
                disabled={busy}
                onChange={(event) =>
                    setParentId(event.target.value === "" ? null : Number(event.target.value))
                }
            >
                <MenuItem value="">Без родителя</MenuItem>
                {categories
                    .filter((category) => category.id !== item?.id && category.isActive)
                    .map((category) => (
                        <MenuItem key={category.id} value={category.id}>
                            {category.name}
                        </MenuItem>
                    ))}
            </TextField>

            {hasColor && hasSize && (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        flexWrap: "wrap",
                        p: "13px",
                        borderRadius: "12px",
                        border: 1,
                        borderColor: alpha(tones.matrix, 0.34),
                        bgcolor: alpha(tones.matrix, 0.08),
                    }}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: tones.matrix }}>
                            Матрица вариантов включена
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: "text.secondary", mt: "2px" }}>
                            {colorField?.name} <b>{colorField?.values.length}</b> × {sizeField?.name}{" "}
                            <b>{sizeField?.values.length}</b> — товар создаст <b>{variants}</b>{" "}
                            {variants === 1 ? "вариант" : "вариантов"} со своими остатками.
                        </Typography>
                    </Box>
                    <Box
                        aria-hidden
                        sx={{
                            ml: "auto",
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 10px)",
                            gap: "5px",
                        }}
                    >
                        {Array.from({ length: 12 }).map((_, index) => (
                            <Box
                                key={`matrix-dot-${index}`}
                                sx={{ width: 10, height: 10, borderRadius: "3px", bgcolor: tones.matrix, opacity: 0.55 }}
                            />
                        ))}
                    </Box>
                </Box>
            )}

            {hasColor !== hasSize && (
                <Alert severity="warning" sx={{ fontSize: 13 }}>
                    Для товарной матрицы включите одновременно «Цвет» и «Размер». По отдельности они
                    не сохраняются.
                </Alert>
            )}

            <Box sx={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                <GroupLabel>Поля в форме товара</GroupLabel>
                {attributes.filter((attribute) => attribute.isActive).length === 0 && (
                    <Typography sx={{ fontSize: 12.5, color: "text.disabled" }}>
                        Активных полей пока нет — сначала создайте их в библиотеке.
                    </Typography>
                )}
                {attributes
                    .filter((attribute) => attribute.isActive)
                    .map((attribute) => {
                        const on = attributeIds.includes(attribute.id);
                        return (
                            <Box
                                key={attribute.id}
                                component="button"
                                type="button"
                                disabled={busy}
                                aria-pressed={on}
                                onClick={() => toggle(attribute.id)}
                                sx={{
                                    appearance: "none",
                                    font: "inherit",
                                    color: "inherit",
                                    textAlign: "left",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    px: "12px",
                                    py: "10px",
                                    borderRadius: "10px",
                                    border: 1,
                                    borderColor: on ? alpha(theme.palette.primary.main, 0.4) : "divider",
                                    bgcolor: on ? theme.palette.primary.lighter : "background.paper",
                                }}
                            >
                                <Box
                                    component="span"
                                    sx={{
                                        width: 17,
                                        height: 17,
                                        flex: "none",
                                        borderRadius: "5px",
                                        display: "grid",
                                        placeItems: "center",
                                        border: 1.5,
                                        borderColor: on ? "primary.main" : "divider",
                                        bgcolor: on ? "primary.main" : "transparent",
                                        color: theme.palette.primary.contrastText,
                                    }}
                                >
                                    {on && <CheckOutlined sx={{ fontSize: 12 }} />}
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                    <Box
                                        sx={{ display: "flex", alignItems: "center", gap: "6px", fontSize: 13, fontWeight: 500 }}
                                    >
                                        <RoleDot role={attribute.role} />
                                        {attribute.name}
                                    </Box>
                                    <Typography sx={{ fontSize: 11.5, color: "text.disabled" }}>
                                        {roleInfo[attribute.role].description}
                                    </Typography>
                                </Box>
                                <Box
                                    component="span"
                                    sx={{
                                        ml: "auto",
                                        fontFamily: MONO,
                                        fontSize: 11,
                                        color: "text.disabled",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {attribute.values.length}
                                </Box>
                            </Box>
                        );
                    })}
            </Box>

            {item && (
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 1,
                        p: "12px",
                        border: 1,
                        borderColor: "divider",
                        borderRadius: "10px",
                        bgcolor: tones.soft,
                    }}
                >
                    <Box>
                        <Typography sx={{ fontSize: 13 }}>Категория активна</Typography>
                        <Typography sx={{ fontSize: 11.5, color: "text.disabled" }}>
                            Скрытая категория не предлагается при создании товара.
                        </Typography>
                    </Box>
                    <Switch
                        checked={active}
                        disabled={busy}
                        onChange={(event) => setActive(event.target.checked)}
                    />
                </Box>
            )}
        </EditorShell>
    );
};

/* ── страница ───────────────────────────────────────────────────────────── */

type Link = { kind: "category" | "field"; id: number } | null;

const ProductAttributesSettingsPage: React.FC = () => {
    const { open: notify } = useNotification();
    const theme = useTheme();
    const tones = useTones();
    const orgId = useApiOrgId();
    const { activeOrganization, loading: permissionsLoading } = usePermissions();

    const [attributes, setAttributes] = React.useState<DjangoProductAttribute[]>([]);
    const [categories, setCategories] = React.useState<DjangoProductCategoryNode[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [tab, setTab] = React.useState<"cats" | "fields">("cats");
    const [link, setLink] = React.useState<Link>(null);
    const [attributeEditor, setAttributeEditor] = React.useState<
        DjangoProductAttribute | null | undefined
    >(undefined);
    const [categoryEditor, setCategoryEditor] = React.useState<
        DjangoProductCategoryNode | null | undefined
    >(undefined);

    const isRetail = activeOrganization?.vertical === "retail";

    const load = React.useCallback(async () => {
        if (activeOrganization?.vertical !== "retail") return;
        setLoading(true);
        try {
            const [nextAttributes, nextCategories] = await Promise.all([
                getProductAttributes(undefined, orgId),
                getProductCategoryTree(undefined, orgId),
            ]);
            setAttributes(nextAttributes);
            setCategories(nextCategories);
        } catch (error) {
            notify?.({
                type: "error",
                message:
                    error instanceof ApiError ? error.message : "Не удалось загрузить настройки товара",
            });
        } finally {
            setLoading(false);
        }
    }, [activeOrganization?.vertical, notify, orgId]);

    React.useEffect(() => {
        void load();
    }, [load]);

    const fieldsOf = React.useCallback(
        (category: DjangoProductCategoryNode) =>
            attributes.filter((attribute) => category.attributeIds.includes(attribute.id)),
        [attributes],
    );

    const visibleCategories = React.useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return categories;
        return categories.filter((category) => category.name.toLowerCase().includes(needle));
    }, [categories, query]);

    const variantCategories = React.useMemo(
        () =>
            categories.filter((category) => {
                const fields = fieldsOf(category);
                return (
                    fields.some((field) => field.role === "color") &&
                    fields.some((field) => field.role === "size")
                );
            }).length,
        [categories, fieldsOf],
    );

    const valueTotal = React.useMemo(
        () => attributes.reduce((sum, attribute) => sum + attribute.values.length, 0),
        [attributes],
    );

    const matrixFields = attributes.filter((attribute) => attribute.role !== "generic");
    const genericFields = attributes.filter((attribute) => attribute.role === "generic");

    /* Подсветка связей: одна активная сущность красит своих соседей. */
    const litCategories = React.useMemo(() => {
        if (!link) return null;
        if (link.kind === "category") return new Set([link.id]);
        return new Set(
            categories
                .filter((category) => category.attributeIds.includes(link.id))
                .map((category) => category.id),
        );
    }, [categories, link]);

    const litFields = React.useMemo(() => {
        if (!link) return null;
        if (link.kind === "field") return new Set([link.id]);
        const category = categories.find((item) => item.id === link.id);
        return new Set(category?.attributeIds ?? []);
    }, [categories, link]);

    const categoryState = (id: number): CardState =>
        !litCategories ? "idle" : litCategories.has(id) ? "lit" : "dim";
    const fieldState = (id: number): CardState =>
        !litFields ? "idle" : litFields.has(id) ? "lit" : "dim";

    const hoverCategory = (category: DjangoProductCategoryNode, on: boolean) => {
        if (!on) {
            setLink((current) =>
                current?.kind === "category" && current.id === category.id ? null : current,
            );
            return;
        }
        if (!category.attributeIds.length) return;
        setLink({ kind: "category", id: category.id });
    };

    const hoverField = (attribute: DjangoProductAttribute, on: boolean) => {
        if (!on) {
            setLink((current) =>
                current?.kind === "field" && current.id === attribute.id ? null : current,
            );
            return;
        }
        setLink({ kind: "field", id: attribute.id });
    };

    const usedIn = (attribute: DjangoProductAttribute) =>
        categories
            .filter((category) => category.attributeIds.includes(attribute.id))
            .map((category) => category.name);

    const addButton = (
        <Button
            variant="contained"
            startIcon={<AddOutlined />}
            disabled={permissionsLoading}
            onClick={() => setCategoryEditor(null)}
            sx={{ "&&": { borderRadius: "9px" }, flex: "none", fontSize: 13 }}
        >
            Категория
        </Button>
    );

    return (
        <SettingsLayout>
            <Box
                sx={{
                    containerType: "inline-size",
                    containerName: CQ,
                    display: "flex",
                    flexDirection: "column",
                    gap: "18px",
                    minWidth: 0,
                }}
            >
                {/* шапка */}
                <Box>
                    <Typography
                        sx={{
                            fontFamily: MONO,
                            fontSize: 10.5,
                            letterSpacing: "0.13em",
                            textTransform: "uppercase",
                            color: "text.disabled",
                        }}
                    >
                        Настройки · Товары
                    </Typography>
                    <Typography
                        component="h2"
                        sx={{
                            fontSize: 21,
                            fontWeight: 600,
                            letterSpacing: "-0.017em",
                            mt: "5px",
                            [`@container ${CQ} (min-width: 760px)`]: { fontSize: 25 },
                        }}
                    >
                        Свойства товара
                    </Typography>
                    <Typography
                        sx={{ fontSize: 13.5, color: "text.secondary", mt: "6px", maxWidth: "66ch" }}
                    >
                        Поля — это кирпичики. Категории — собранные из них формы. Сотрудник выбирает
                        категорию в карточке товара, и форма подстраивается сама.
                    </Typography>

                    {isRetail && (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "8px", mt: "14px" }}>
                            <Meter value={categories.length} label="категории" />
                            <Meter value={attributes.length} label="поля" />
                            <Meter value={variantCategories} label="создаёт варианты" accent={tones.matrix} />
                            <Meter value={valueTotal} label="значений" />
                        </Box>
                    )}
                </Box>

                {activeOrganization && !isRetail && (
                    <Alert severity="info">
                        Настройка форм категорий доступна организациям с вертикалью «Розничная
                        торговля».
                    </Alert>
                )}

                {isRetail && (
                    <>
                        {/* переключатель разделов — только пока рейл не помещается рядом */}
                        <Box
                            role="group"
                            aria-label="Раздел"
                            sx={{
                                display: "flex",
                                gap: "4px",
                                p: "3px",
                                border: 1,
                                borderColor: "divider",
                                borderRadius: "999px",
                                bgcolor: tones.soft,
                                [`@container ${CQ} (min-width: 1040px)`]: { display: "none" },
                            }}
                        >
                            {(["cats", "fields"] as const).map((key) => (
                                <Box
                                    key={key}
                                    component="button"
                                    type="button"
                                    aria-pressed={tab === key}
                                    onClick={() => setTab(key)}
                                    sx={{
                                        appearance: "none",
                                        font: "inherit",
                                        cursor: "pointer",
                                        flex: 1,
                                        py: "8px",
                                        borderRadius: "999px",
                                        border: 0,
                                        fontSize: 13,
                                        fontWeight: 500,
                                        bgcolor: tab === key ? "background.paper" : "transparent",
                                        color: tab === key ? "text.primary" : "text.secondary",
                                        boxShadow: tab === key ? theme.shadows[1] : "none",
                                    }}
                                >
                                    {key === "cats" ? "Категории" : "Поля"}
                                </Box>
                            ))}
                        </Box>

                        <Box
                            sx={{
                                display: "grid",
                                gap: "18px",
                                minWidth: 0,
                                [`@container ${CQ} (min-width: 1040px)`]: {
                                    gridTemplateColumns: "minmax(0, 1fr) 322px",
                                    gap: "24px",
                                    alignItems: "start",
                                },
                            }}
                        >
                            {/* ── категории ── */}
                            <Box
                                sx={{
                                    minWidth: 0,
                                    [`@container ${CQ} (max-width: 1039.98px)`]: {
                                        display: tab === "cats" ? "block" : "none",
                                    },
                                }}
                            >
                                <Box sx={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                                    <TextField
                                        size="small"
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="Поиск по категориям"
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <SearchOutlined sx={{ fontSize: 17, color: "text.disabled" }} />
                                                </InputAdornment>
                                            ),
                                        }}
                                        sx={{
                                            flex: "1 1 180px",
                                            minWidth: 0,
                                            "&& .MuiOutlinedInput-root": {
                                                borderRadius: "9px",
                                                bgcolor: tones.soft,
                                                fontSize: 13,
                                            },
                                            "&& .MuiOutlinedInput-notchedOutline": {
                                                borderColor: theme.palette.divider,
                                            },
                                        }}
                                    />
                                    {addButton}
                                </Box>

                                <Box
                                    sx={{
                                        display: "grid",
                                        gap: "12px",
                                        mt: "12px",
                                        minWidth: 0,
                                        [`@container ${CQ} (min-width: 640px)`]: {
                                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                        },
                                        [`@container ${CQ} (min-width: 1360px)`]: {
                                            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                        },
                                    }}
                                >
                                    {loading &&
                                        !categories.length &&
                                        [0, 1, 2, 3].map((index) => (
                                            <Skeleton
                                                key={index}
                                                variant="rounded"
                                                height={210}
                                                sx={{ borderRadius: "12px" }}
                                            />
                                        ))}

                                    {!loading &&
                                        visibleCategories.map((category) => (
                                            <CategoryCard
                                                key={category.id}
                                                category={category}
                                                fields={fieldsOf(category)}
                                                state={categoryState(category.id)}
                                                onOpen={() => setCategoryEditor(category)}
                                                onHover={(on) => hoverCategory(category, on)}
                                            />
                                        ))}

                                    {!loading && !visibleCategories.length && (
                                        <Box
                                            component="button"
                                            type="button"
                                            onClick={() => setCategoryEditor(null)}
                                            sx={{
                                                appearance: "none",
                                                font: "inherit",
                                                color: "text.disabled",
                                                cursor: "pointer",
                                                p: "26px 14px",
                                                border: "1px dashed",
                                                borderColor: "divider",
                                                borderRadius: "12px",
                                                textAlign: "center",
                                                fontSize: 13,
                                                bgcolor: "transparent",
                                            }}
                                        >
                                            {query
                                                ? "Ничего не нашлось — измените запрос"
                                                : "Создайте «Одежда» и включите в неё Бренд, Цвет и Размер"}
                                        </Box>
                                    )}
                                </Box>

                                {/* на узком экране кнопка должна оставаться под рукой */}
                                <Box
                                    sx={{
                                        display: "none",
                                        justifyContent: "flex-end",
                                        position: "sticky",
                                        bottom: "14px",
                                        mt: "14px",
                                        [`@container ${CQ} (max-width: 639.98px)`]: { display: "flex" },
                                    }}
                                >
                                    {addButton}
                                </Box>
                            </Box>

                            {/* ── библиотека полей ── */}
                            <Box
                                sx={{
                                    minWidth: 0,
                                    [`@container ${CQ} (max-width: 1039.98px)`]: {
                                        display: tab === "fields" ? "block" : "none",
                                    },
                                    [`@container ${CQ} (min-width: 1040px)`]: {
                                        position: "sticky",
                                        top: "14px",
                                    },
                                }}
                            >
                                <Box
                                    sx={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "10px",
                                        p: "13px",
                                        borderRadius: "12px",
                                        border: 1,
                                        borderColor: "divider",
                                        bgcolor: tones.soft,
                                    }}
                                >
                                    <Box sx={{ display: "flex", alignItems: "center", gap: "9px" }}>
                                        <Typography
                                            sx={{
                                                fontSize: 12,
                                                fontWeight: 600,
                                                letterSpacing: "0.06em",
                                                textTransform: "uppercase",
                                                color: "text.disabled",
                                            }}
                                        >
                                            Поля
                                        </Typography>
                                        <Box
                                            component="span"
                                            sx={{
                                                fontFamily: MONO,
                                                fontSize: 11,
                                                px: "7px",
                                                borderRadius: "999px",
                                                bgcolor: tones.soft2,
                                                color: "text.secondary",
                                            }}
                                        >
                                            {attributes.length}
                                        </Box>
                                        <Button
                                            size="small"
                                            startIcon={<AddOutlined />}
                                            disabled={permissionsLoading}
                                            onClick={() => setAttributeEditor(null)}
                                            sx={{
                                                "&&": { borderRadius: "9px" },
                                                ml: "auto",
                                                px: "9px",
                                                py: "5px",
                                                minHeight: 0,
                                                fontSize: 13,
                                                fontWeight: 500,
                                                color: "text.secondary",
                                            }}
                                        >
                                            Поле
                                        </Button>
                                    </Box>

                                    {loading && !attributes.length && (
                                        <>
                                            <Skeleton variant="rounded" height={78} sx={{ borderRadius: "10px" }} />
                                            <Skeleton variant="rounded" height={78} sx={{ borderRadius: "10px" }} />
                                        </>
                                    )}

                                    {!loading && !attributes.length && (
                                        <Typography sx={{ fontSize: 12.5, color: "text.disabled" }}>
                                            Полей пока нет. Начните с «Цвет» и «Размер» — вместе они
                                            создают варианты товара.
                                        </Typography>
                                    )}

                                    {Boolean(matrixFields.length) && <GroupLabel>Создают варианты</GroupLabel>}
                                    {matrixFields.map((attribute) => (
                                        <FieldCard
                                            key={attribute.id}
                                            attribute={attribute}
                                            usedIn={usedIn(attribute)}
                                            state={fieldState(attribute.id)}
                                            onOpen={() => setAttributeEditor(attribute)}
                                            onHover={(on) => hoverField(attribute, on)}
                                        />
                                    ))}

                                    {Boolean(genericFields.length) && <GroupLabel>Обычные поля</GroupLabel>}
                                    {genericFields.map((attribute) => (
                                        <FieldCard
                                            key={attribute.id}
                                            attribute={attribute}
                                            usedIn={usedIn(attribute)}
                                            state={fieldState(attribute.id)}
                                            onOpen={() => setAttributeEditor(attribute)}
                                            onHover={(on) => hoverField(attribute, on)}
                                        />
                                    ))}
                                </Box>
                            </Box>
                        </Box>
                    </>
                )}

                <AttributeEditor
                    open={attributeEditor !== undefined}
                    item={attributeEditor ?? null}
                    onClose={() => setAttributeEditor(undefined)}
                    onChanged={() => void load()}
                    organizationId={orgId}
                />
                <CategoryEditor
                    open={categoryEditor !== undefined}
                    item={categoryEditor ?? null}
                    attributes={attributes}
                    categories={categories}
                    onClose={() => setCategoryEditor(undefined)}
                    onChanged={() => void load()}
                    organizationId={orgId}
                />
            </Box>
        </SettingsLayout>
    );
};

export default ProductAttributesSettingsPage;
