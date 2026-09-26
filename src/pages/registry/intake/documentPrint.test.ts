import { describe, expect, it } from "vitest";

import type { PrintRender } from "../../../api/registry";
import { renderDocumentHtml } from "./documentPrint";

function render(overrides: Partial<PrintRender> = {}): PrintRender {
  return {
    templateId: 1,
    kind: "blank",
    pageSize: "A4",
    orientation: "portrait",
    fields: [],
    background: {},
    data: { child: { fullName: "Иванов <Али>", cardNumber: "МД-7" }, branch: { phones: ["+996 1", "+996 2"] } },
    ...overrides,
  };
}

describe("document print", () => {
  it("fills template fields by path and escapes the values", () => {
    const html = renderDocumentHtml(render({ fields: [{ label: "Ребёнок", slot: "child.fullName" }] }));
    expect(html).toContain("<th>Ребёнок</th><td>Иванов &lt;Али&gt;</td>");
    expect(html).not.toContain("cardNumber");
    expect(html).toContain("@page{size:A4 portrait}");
  });

  it("prints every value when the template has no fields", () => {
    const html = renderDocumentHtml(render());
    expect(html).toContain("<th>child.cardNumber</th><td>МД-7</td>");
    expect(html).toContain("<th>branch.phones</th><td>+996 1, +996 2</td>");
  });

  it("prints the blank text with filled placeholders instead of the table", () => {
    const html = renderDocumentHtml(
      render({ body: "Ребёнок: {child.fullName}\n\nКарта {child.cardNumber}", fields: [{ label: "X", slot: "child.fullName" }] }),
    );
    expect(html).toContain("<p>Ребёнок: Иванов &lt;Али&gt;</p>");
    expect(html).toContain("<p>&nbsp;</p>");
    expect(html).toContain("<p>Карта МД-7</p>");
    expect(html).not.toContain("<table>");
  });
});
