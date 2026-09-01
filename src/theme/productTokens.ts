import React from "react";
import { alpha } from "@mui/material";
import { useTheme } from "@mui/material/styles";

/**
 * Общий язык страниц про товар: «Свойства товара» (настройки) и каталог.
 *
 * Раньше эти значения жили внутри страницы настроек, и каталог рисовал свои —
 * образцы разъезжались на пиксель, роли красились по-разному. Здесь один
 * источник: меняешь тут — меняется на обоих экранах.
 *
 * Размеры, завязанные на эти токены (не разъезжаться!):
 *   образец цвета   19px, радиус 6   (компактный — 14px)
 *   чип значения    mono 11, радиус 6, поля 2×7
 *   пилюля статуса  11.5, поля 3×9, радиус 999
 *   счётчик         число 16/600 + подпись 12, коробка 7×12, радиус 9
 *   служебная метка mono 10, uppercase, letter-spacing .12em
 */

export const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export type AttributeRole = "generic" | "color" | "size";

export type ProductTones = {
    /** Цвет роли поля: им красится и полоска в настройках, и точка в каталоге. */
    role: Record<AttributeRole, string>;
    /** Бирюзовый значит «создаёт варианты» и больше ничего. */
    matrix: string;
    ok: string;
    danger: string;
    /** Утопленная подложка: поиск, рейл, базовые строки превью. */
    soft: string;
    /** Подложка чипов значений. */
    soft2: string;
    /** Хайрлайн внутри карточки — слабее divider. */
    lineSoft: string;
};

export function useProductTones(): ProductTones {
    const theme = useTheme();
    const dark = theme.palette.mode === "dark";
    return React.useMemo(
        () => ({
            role: {
                color: dark ? "#C084FC" : "#9333EA",
                size: dark ? "#F5A524" : "#C2410C",
                generic: dark ? "#94A3B8" : "#5C6B85",
            },
            matrix: dark ? "#2DD4BF" : "#0D8A80",
            ok: dark ? "#4ADE80" : "#16A34A",
            danger: dark ? "#F87171" : "#DC2626",
            soft: dark ? alpha("#FFFFFF", 0.045) : alpha("#0B0A10", 0.035),
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
 * одно и то же значение всегда красилось одинаково на всех экранах.
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

export function swatchOf(value: string, code?: string): string {
    if (code && HEX_RE.test(code)) return code.startsWith("#") ? code : `#${code}`;
    const key = value.trim().toLowerCase();
    const hit = COLOR_NAMES.find(([name]) => key.includes(name));
    if (hit) return hit[1];
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 360;
    return `hsl(${hash} 42% 55%)`;
}

/* ── склонения ──────────────────────────────────────────────────────────── */

const plural = (count: number, one: string, few: string, many: string): string => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} ${few}`;
    return `${count} ${many}`;
};

export const pluralValues = (count: number): string =>
    count === 0 ? "нет значений" : plural(count, "значение", "значения", "значений");

export const pluralFields = (count: number): string => plural(count, "поле", "поля", "полей");

export const pluralVariants = (count: number): string =>
    plural(count, "вариант", "варианта", "вариантов");

export const pluralPositions = (count: number): string =>
    plural(count, "позиция", "позиции", "позиций");
