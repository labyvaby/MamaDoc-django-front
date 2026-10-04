import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { makeReport } from "../../features/pnl/fixture";
import { DEFAULT_EXPANDED } from "../../features/pnl/model";
import { PnlTable } from "./PnlTable";

describe("PnlTable", () => {
  it("рисует строки формы, коды, детали и прочерки", () => {
    const html = renderToString(
      <PnlTable report={makeReport()} expanded={new Set(DEFAULT_EXPANDED)} onToggle={() => {}} />,
    );
    expect(html).toContain("Выручка");
    expect(html).toContain("Услуги");
    expect(html).toContain("010");
    expect(html).toContain("янв");
    expect(html).toContain("—");
    expect(html).toContain("−220");
  });

  it("помечает незакрытый месяц и подписывает год, если период через год", () => {
    const report = makeReport({ months: [{ key: "2025-12", open: false }, { key: "2026-01", open: true }] });
    const html = renderToString(<PnlTable report={report} expanded={new Set()} onToggle={() => {}} />);
    expect(html).toContain("не закрыт");
    expect(html).toContain("дек 2025");
  });
});
