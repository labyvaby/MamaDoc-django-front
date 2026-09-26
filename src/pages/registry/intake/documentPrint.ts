import type { PrintRender } from "../../../api/registry";
import { fillBlank, lookupPath } from "../../../utils/blankText";

/**
 * printforms отдаёт только контекст (геометрия, поля, текст, данные), бланк
 * рисует клиент. Текст бланка (`body`) печатается абзацами с подстановками
 * `{child.fullName}`; без текста поле шаблона со `slot`/`key` берёт
 * значение по пути в `data`, а шаблон без полей печатает все данные таблицей.
 */

function lookup(data: Record<string, unknown>, path: string): string {
  const value = lookupPath(data, path);
  if (value == null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

function flatten(data: Record<string, unknown>, prefix = ""): Array<[string, string]> {
  return Object.entries(data).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flatten(value as Record<string, unknown>, path);
    }
    return [[path, Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value)]];
  });
}

function bodyHtml(body: string, data: Record<string, unknown>): string {
  return body
    .split("\n")
    .map((line) => {
      const text = escapeHtml(fillBlank(line, data));
      return text.trim() ? `<p>${text}</p>` : "<p>&nbsp;</p>";
    })
    .join("");
}

export function renderDocumentHtml(render: PrintRender, title = "Документ"): string {
  const rows = render.fields.length
    ? render.fields.map((field) => {
        const path = field.slot ?? field.key ?? "";
        return `<tr><th>${escapeHtml(field.label ?? path)}</th><td>${escapeHtml(lookup(render.data, path))}</td></tr>`;
      })
    : flatten(render.data).map(([path, value]) => `<tr><th>${escapeHtml(path)}</th><td>${escapeHtml(value)}</td></tr>`);
  const page = `${escapeHtml(render.pageSize)} ${escapeHtml(render.orientation)}`;
  const content = render.body?.trim() ? bodyHtml(render.body, render.data) : `<table>${rows.join("")}</table>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font:12pt/1.4 Arial,sans-serif;margin:20mm}th{text-align:left;padding:4px 12px 4px 0;vertical-align:top;font-weight:600}td{padding:4px 0}p{margin:0 0 6px;white-space:pre-wrap}@page{size:${page}}</style></head>
<body>${content}<script>window.onload=function(){window.print()}</script></body></html>`;
}

export function openPrintWindow(render: PrintRender, title?: string): boolean {
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return false;
  win.opener = null;
  win.document.write(renderDocumentHtml(render, title));
  win.document.close();
  return true;
}
