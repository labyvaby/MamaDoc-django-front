import { describe, expect, it } from "vitest";

import {
    money,
    picksLabel,
    positionsLabel,
    qty,
    resolveStatus,
    rowDiff,
    rowDiffSum,
    STATUS_ORDER,
    type CountRow,
} from "./inventoryModel";

const row = (patch: Partial<CountRow> = {}): CountRow => ({
    productId: 1,
    name: "Шприц 5 мл",
    category: "Расходники",
    barcode: "4870115820014",
    barcodes: [],
    unit: "шт",
    price: 8,
    expected: 200,
    counted: null,
    ...patch,
});

describe("resolveStatus", () => {
    it("разделяет «не дошли до полки» и «полка пуста»", () => {
        // Ключевое различие: бэк отбрасывает непосчитанные строки, а ноль списывает.
        expect(resolveStatus(200, null)).toBe("wait");
        expect(resolveStatus(200, 0)).toBe("none");
    });

    it("сравнивает факт с ожиданием", () => {
        expect(resolveStatus(200, 184)).toBe("short");
        expect(resolveStatus(200, 200)).toBe("ok");
        expect(resolveStatus(200, 214)).toBe("over");
    });

    it("ноль против нулевого ожидания — это совпадение, а не недостача", () => {
        expect(resolveStatus(0, 0)).toBe("ok");
    });
});

describe("rowDiff", () => {
    it("у непосчитанной позиции разницы нет", () => {
        expect(rowDiff(row())).toBe(0);
        expect(rowDiffSum(row())).toBe(0);
    });

    it("считает недостачу и излишек со знаком", () => {
        expect(rowDiff(row({ counted: 184 }))).toBe(-16);
        expect(rowDiffSum(row({ counted: 184 }))).toBe(-128);
        expect(rowDiff(row({ counted: 214 }))).toBe(14);
        expect(rowDiffSum(row({ counted: 214 }))).toBe(112);
    });
});

describe("порядок блоков", () => {
    it("идёт от требующего решения к сошедшемуся", () => {
        expect(STATUS_ORDER).toEqual(["unknown", "none", "short", "over", "wait", "ok"]);
    });
});

describe("подписи", () => {
    it("склоняет счётчики", () => {
        expect(picksLabel(1)).toBe("1 пик");
        expect(picksLabel(2)).toBe("2 пика");
        expect(picksLabel(5)).toBe("5 пиков");
        expect(picksLabel(11)).toBe("11 пиков");
        expect(picksLabel(21)).toBe("21 пик");
        expect(positionsLabel(3)).toBe("3 позиции");
    });

    it("показывает минус у недостачи и режет копейки", () => {
        // Intl разделяет тысячи неразрывным пробелом — сравниваем по смыслу, не по байтам.
        const plain = (value: number) => money(value).replace(/[\u00a0\u202f\u2009]/g, " ");
        expect(plain(-17858)).toBe("−17 858 c");
        expect(plain(0)).toBe("0 c");
        expect(plain(260.4)).toBe("260 c");
    });

    it("не дописывает нули к целым количествам", () => {
        expect(qty(12)).toBe("12");
        expect(qty(1.5)).toBe("1.5");
    });
});
