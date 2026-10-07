import { describe, expect, it } from "vitest";

import {
  defaultCashlessId,
  fillRemainder,
  initialSplitRows,
  parseAmountCents,
  payAllWith,
  splitPayments,
  splitState,
  type SplitRow,
} from "./splitPayment";

const terminals = [
  { id: 7, name: "POS МБанк", isDefault: false },
  { id: 3, name: "POS Бакай", isDefault: true },
  { id: 9, name: "POS Оптима", isDefault: false },
];
const rows = (cash: string, card: string, qr: string, cardTerminal: number | null = 3, qrTerminal: number | null = 3): SplitRow[] => [
  { kind: "cash", amount: cash, cashlessMethodId: null },
  { kind: "card", amount: card, cashlessMethodId: cardTerminal },
  { kind: "cashless", amount: qr, cashlessMethodId: qrTerminal },
];
const DUE = 500000; // 5 000 с
/** Amounts are grouped with no-break spaces; compare them as plain text. */
const plain = (text: string | null) => text?.replace(/\u00a0/g, " ") ?? null;

describe("parseAmountCents", () => {
  it("reads empty, digit groups and comma decimals", () => {
    expect(parseAmountCents("")).toBe(0);
    expect(parseAmountCents("1 200")).toBe(120000);
    expect(parseAmountCents("1\u00a0200,5")).toBe(120050);
    expect(parseAmountCents("12.345")).toBeNaN();
    expect(parseAmountCents("-5")).toBeNaN();
    expect(parseAmountCents("abc")).toBeNaN();
  });
});

describe("defaultCashlessId", () => {
  it("prefers the default terminal, then the first one", () => {
    expect(defaultCashlessId(terminals)).toBe(3);
    expect(defaultCashlessId(terminals.map((item) => ({ ...item, isDefault: false })))).toBe(7);
    expect(defaultCashlessId([{ id: 4, name: "Без признака" }])).toBe(4);
    expect(defaultCashlessId([])).toBeNull();
  });
});

describe("splitState", () => {
  it("starts with nothing entered and asks for the whole sum", () => {
    const state = splitState(DUE, initialSplitRows(["cash", "card", "cashless"], terminals));
    expect(state).toMatchObject({ entered: 0, remaining: DUE, change: 0, ready: false });
    expect(plain(state.problem)).toBe("Внесите 5 000 с");
  });

  it("tells how much is left while the sum is short", () => {
    const state = splitState(DUE, rows("2000", "1800", ""));
    expect(state).toMatchObject({ entered: 380000, remaining: 120000, change: 0, ready: false });
    expect(plain(state.problem)).toBe("Осталось внести 1 200 с");
  });

  it("is ready when cash, card and QR add up exactly", () => {
    const state = splitState(DUE, rows("2000", "2000", "1000"));
    expect(state).toMatchObject({ entered: DUE, remaining: 0, change: 0, ready: true, problem: null });
  });

  it("gives change from cash only", () => {
    const state = splitState(DUE, rows("3000", "2500", ""));
    expect(state).toMatchObject({ entered: 550000, remaining: 0, change: 50000, ready: true });
  });

  it("refuses card and QR above the sum: no change from cashless", () => {
    const state = splitState(DUE, rows("", "4000", "1500"));
    expect(state.ready).toBe(false);
    expect(state.change).toBe(0);
    expect(plain(state.problem)).toBe("Картой и QR на 500 с больше суммы — сдача только с наличных");
    expect(state.problemKind).toBe("card");
  });

  it("points at a broken amount", () => {
    const state = splitState(DUE, rows("2000", "3000,999", ""));
    expect(state.ready).toBe(false);
    expect(state.problemKind).toBe("card");
    expect(state.problem).toBe("Проверьте сумму в строке «Карта»");
  });

  it("asks for a terminal only when terminals exist and the row has money", () => {
    expect(splitState(DUE, rows("2000", "3000", "", null), { needTerminal: true }).problem).toBe(
      "Выберите терминал для строки «Карта»"
    );
    expect(splitState(DUE, rows("2000", "3000", "", null)).ready).toBe(true);
    expect(splitState(DUE, rows("5000", "", "", null, null), { needTerminal: true }).ready).toBe(true);
  });

  it("is ready at once for a zero due", () => {
    expect(splitState(0, rows("", "", "")).ready).toBe(true);
  });
});

describe("splitPayments", () => {
  it("sends one payment per non-empty row with its terminal", () => {
    expect(splitPayments(DUE, rows("2000", "2000", "1000", 3, 9))).toEqual([
      { method: "cash", amount: "2000.00" },
      { method: "card", amount: "2000.00", cashlessMethodId: 3 },
      { method: "cashless", amount: "1000.00", cashlessMethodId: 9 },
    ]);
  });

  it("keeps the change out of the cash payment", () => {
    expect(splitPayments(DUE, rows("3000", "2500", ""))).toEqual([
      { method: "cash", amount: "2500.00" },
      { method: "card", amount: "2500.00", cashlessMethodId: 3 },
    ]);
  });

  it("drops cash that is all change", () => {
    expect(splitPayments(DUE, rows("200", "5000", ""))).toEqual([
      { method: "card", amount: "5000.00", cashlessMethodId: 3 },
    ]);
  });

  it("omits the terminal when none is chosen", () => {
    expect(splitPayments(DUE, rows("1000,50", "3999.50", "", null))).toEqual([
      { method: "cash", amount: "1000.50" },
      { method: "card", amount: "3999.50" },
    ]);
  });

  it("always adds up to the due once the state is ready", () => {
    const cases = [rows("2500", "1250", "1250"), rows("7000", "", ""), rows("100", "4900", ""), rows("0", "", "5000")];
    for (const value of cases) {
      expect(splitState(DUE, value).ready).toBe(true);
      const total = splitPayments(DUE, value).reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0);
      expect(total).toBe(DUE);
    }
  });
});

describe("quick buttons", () => {
  it("puts the remainder into the chosen row", () => {
    const next = fillRemainder(DUE, rows("2000", "", ""), "card");
    expect(next[1].amount).toBe("3000");
    expect(splitState(DUE, next).ready).toBe(true);
    // Nothing is left: the button changes nothing.
    expect(fillRemainder(DUE, next, "cashless")).toEqual(next);
  });

  it("adds the remainder to what the row already has", () => {
    expect(fillRemainder(DUE, rows("1000", "1500,25", ""), "card")[1].amount).toBe("4000");
  });

  it("pays everything with one method and clears the rest", () => {
    const next = payAllWith(123450, rows("2000", "100", "5"), "card");
    expect(next.map((row) => row.amount)).toEqual(["", "1234.50", ""]);
    expect(next[1].cashlessMethodId).toBe(3);
  });

  it("presets the default terminal on card and QR rows", () => {
    expect(initialSplitRows(["cash", "card", "cashless"], terminals)).toEqual([
      { kind: "cash", amount: "", cashlessMethodId: null },
      { kind: "card", amount: "", cashlessMethodId: 3 },
      { kind: "cashless", amount: "", cashlessMethodId: 3 },
    ]);
  });
});
