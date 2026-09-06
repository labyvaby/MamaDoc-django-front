import type React from "react";
import { alpha } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import HelpOutlineOutlined from "@mui/icons-material/HelpOutlineOutlined";
import HighlightOffOutlined from "@mui/icons-material/HighlightOffOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import CheckCircleOutlineOutlined from "@mui/icons-material/CheckCircleOutlineOutlined";
import QrCodeScannerOutlined from "@mui/icons-material/QrCodeScannerOutlined";

/**
 * Модель разрядов инвентаризации по штрихкодам: статус позиции, его цвет и
 * подписи. Один источник правды — из него красится вся строка и весь блок,
 * поэтому цвет нигде не задаётся хексом по месту.
 */
export type InventoryStatus = "unknown" | "none" | "short" | "over" | "ok" | "wait";

/**
 * Порядок блоков в итогах: от того, что требует решения, к тому, где сошлось.
 * «Не посчитаны» идут перед «Совпало»: это не расхождение, но и не результат —
 * до этих полок просто не дошли, и при проведении они не тронутся.
 */
export const STATUS_ORDER: InventoryStatus[] = ["unknown", "none", "short", "over", "wait", "ok"];

export const STATUS_TITLE: Record<InventoryStatus, string> = {
    unknown: "Неизвестные товары",
    none: "Нет в наличии",
    short: "Недостача",
    over: "Излишек",
    ok: "Совпало",
    wait: "Не посчитаны",
};

export const STATUS_HINT: Record<InventoryStatus, string> = {
    unknown: "Штрихкод пробит, но такого товара нет в базе",
    none: "Полку проверили — товара нет, факт ноль",
    short: "Факт меньше ожидаемого остатка",
    over: "Факт больше ожидаемого — приход на склад",
    ok: "Ожидаемый и фактический остаток равны",
    wait: "До этих полок не дошли — при проведении останутся без изменений",
};

export const STATUS_ICON: Record<InventoryStatus, React.ComponentType<SvgIconProps>> = {
    unknown: HelpOutlineOutlined,
    none: HighlightOffOutlined,
    short: TrendingDownOutlined,
    over: TrendingUpOutlined,
    ok: CheckCircleOutlineOutlined,
    wait: QrCodeScannerOutlined,
};

export type StatusTone = {
    /** Заливка иконки/счётчика. */
    main: string;
    /** Контраст-безопасный вариант того же цвета КАК ТЕКСТ на поверхности. */
    text: string;
    /** Лёгкая подложка строки и шапки блока. */
    tint: string;
    /** Грань блока/строки. */
    border: string;
    /** Текст поверх заливки main. */
    contrast: string;
};

/**
 * Цвет разряда. «Неизвестный» берёт `secondary` (фиолетовый), а не кастомный
 * `purple`: purple #6366f1 почти совпадает с primary, и тонированная строка
 * сливалась бы с активными элементами интерфейса.
 */
export const statusTone = (theme: Theme, status: InventoryStatus): StatusTone => {
    const dark = theme.palette.mode === "dark";
    const color = status === "unknown" ? theme.palette.secondary
        : status === "none" ? theme.palette.error
            : status === "short" ? theme.palette.warning
                : status === "over" ? theme.palette.info
                    : status === "ok" ? theme.palette.success
                        : null;

    if (!color) {
        return {
            main: theme.palette.text.disabled,
            text: theme.palette.text.secondary,
            tint: alpha(theme.palette.text.primary, dark ? 0.05 : 0.025),
            border: theme.palette.divider,
            contrast: theme.palette.background.paper,
        };
    }

    return {
        main: color.main,
        text: color.onSurface,
        tint: color.lighter,
        border: alpha(color.main, dark ? 0.42 : 0.3),
        contrast: color.contrastText,
    };
};

/** Строка документа в терминах экрана: ожидание из бэка + локальный факт. */
export type CountRow = {
    productId: number;
    name: string;
    category: string;
    barcode: string;
    /** Дополнительные штрихкоды товара (упаковка, старая маркировка). */
    barcodes: string[];
    unit: string;
    /** Цена продажи, сом — по ней считаем сумму расхождения. */
    price: number;
    expected: number;
    /** null — позицию ещё не пикали; 0 — пикали и обнулили вручную. */
    counted: number | null;
};

/** Пробитый штрихкод, которого нет в базе. */
export type UnknownScan = {
    barcode: string;
    picks: number;
};

export const resolveStatus = (expected: number, counted: number | null): InventoryStatus => {
    if (counted == null) return "wait";
    if (counted <= 0) return expected > 0 ? "none" : "ok";
    if (counted < expected) return "short";
    if (counted > expected) return "over";
    return "ok";
};

/**
 * Разница «факт минус ожидание» в единицах товара. У непосчитанной позиции
 * разницы нет: «не дошли до полки» и «полка пуста» — разные утверждения, и
 * второе списало бы весь непосчитанный остаток (см. close в бэкенде).
 */
export const rowDiff = (row: CountRow): number =>
    row.counted == null ? 0 : row.counted - row.expected;

/** Сумма расхождения по строке, сом. Недостача отрицательная. */
export const rowDiffSum = (row: CountRow): number => rowDiff(row) * row.price;

const RU_PLURAL = (n: number, one: string, few: string, many: string): string => {
    const abs = Math.abs(n) % 100;
    const tail = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (tail > 1 && tail < 5) return few;
    return tail === 1 ? one : many;
};

export const plural = RU_PLURAL;

/** «1 пик / 2 пика / 5 пиков» — счётчики не должны читаться как машинный вывод. */
export const picksLabel = (n: number): string => `${n} ${RU_PLURAL(n, "пик", "пика", "пиков")}`;

export const positionsLabel = (n: number): string =>
    `${n} ${RU_PLURAL(n, "позиция", "позиции", "позиций")}`;

const MONEY = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

/** Сумма с явным знаком минуса и единицей «c» — как в остальных экранах склада. */
export const money = (value: number): string =>
    `${value < 0 ? "−" : ""}${MONEY.format(Math.abs(Math.round(value)))} c`;

/** Количество без хвоста «.00», но с дробью, если она есть. */
export const qty = (value: number): string =>
    Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
