// Проверка перед выкладкой: страница CRM не уходит на прод без права роли.
//
// Решение владельца (2026-10-06): модуль без ролей на прод не выкладывается.
// Страница внутри CRM (под RequireAuth) считается защищённой, если её
// element содержит RequirePermission или RequireModule (или это просто
// Navigate-переадресация). «Только суперадминистратор» (RequireSuperAdmin) и
// страница без проверки права допускаются лишь по явному списку исключений с
// причиной — scripts/route-guards-allowlist.json.
//
// Коды прав из src/config/accessPermissions.ts и литералы в App.tsx должны
// быть в каталоге ролей бэкенда (sync_permissions.py) — иначе права не будет
// в редакторе ролей и страницу увидит только суперадминистратор. Каталог
// передаёт скрипт выкладки (BACKEND_PERMISSIONS_FILE); без него эта часть
// пропускается.
//
// Запуск: node scripts/check-route-guards.mjs (в скрипте выкладки — до сборки).

import fs from "node:fs";
import ts from "typescript";

const GUARD_TAGS = new Set(["RequirePermission", "RequireModule"]);
const REDIRECT_TAGS = new Set(["Navigate"]);
const AUTH_TAG = "RequireAuth";
const SUPERADMIN_TAG = "RequireSuperAdmin";

function tagName(node) {
  const name = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return name.getText();
}

function attributes(node) {
  return ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
}

function attr(node, name) {
  return attributes(node).properties.find(
    (p) => ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

function stringAttr(node, name) {
  const a = attr(node, name);
  if (!a || !a.initializer) return a ? "" : undefined;
  if (ts.isStringLiteral(a.initializer)) return a.initializer.text;
  return undefined;
}

/** Имена всех JSX-тегов внутри узла. */
function jsxTags(node, out = new Set()) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) out.add(tagName(node));
  // forEachChild прекращает обход, если обработчик вернул значение, — не возвращаем.
  node.forEachChild((child) => {
    jsxTags(child, out);
  });
  return out;
}

/** Строковые литералы внутри узла, похожие на коды прав («a.b», «a.b.c»). */
function codeLiterals(node, out = new Set()) {
  if (ts.isStringLiteral(node) && /^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(node.text)) out.add(node.text);
  node.forEachChild((child) => {
    codeLiterals(child, out);
  });
  return out;
}

function isRoute(node) {
  return (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && tagName(node) === "Route";
}

function joinPath(parent, child) {
  if (child === undefined) return parent;
  if (child.startsWith("/")) return child;
  const base = parent.endsWith("/") ? parent : `${parent}/`;
  return `${base}${child}`.replace(/\/+/g, "/");
}

/**
 * Все Route из App.tsx: полный путь, защищена ли входом (есть RequireAuth у
 * предков или у себя), какие теги в element, есть ли вложенные Route.
 */
export function collectRoutes(source, fileName = "App.tsx") {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const routes = [];
  const literals = new Set();

  function visit(node, parentPath, underAuth) {
    if (isRoute(node)) {
      const element = attr(node, "element");
      const tags = element?.initializer ? jsxTags(element.initializer) : new Set();
      if (element?.initializer) codeLiterals(element.initializer, literals);
      const isIndex = attr(node, "index") !== undefined;
      const path = joinPath(parentPath, isIndex ? "" : stringAttr(node, "path"));
      const auth = underAuth || tags.has(AUTH_TAG);
      const hasChildren = ts.isJsxElement(node) && node.children.some((c) => containsRoute(c));
      routes.push({ path: path || "/", tags, underAuth: auth, hasElement: Boolean(element), hasChildren, isIndex });
      if (ts.isJsxElement(node)) node.children.forEach((c) => visit(c, path, auth));
      return;
    }
    node.forEachChild((c) => visit(c, parentPath, underAuth));
  }

  function containsRoute(node) {
    if (isRoute(node)) return true;
    let found = false;
    node.forEachChild((c) => {
      if (!found && containsRoute(c)) found = true;
    });
    return found;
  }

  visit(sf, "", false);
  return { routes, literals };
}

/** Коды прав из реестра страниц (все строковые значения-коды файла). */
export function registryCodes(source, fileName = "accessPermissions.ts") {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return codeLiterals(sf);
}

/** Коды каталога ролей бэкенда из sync_permissions.py. */
export function catalogueCodes(pythonSource) {
  const codes = new Set();
  for (const m of pythonSource.matchAll(/\(\s*'([a-z0-9_]+(?:\.[a-z0-9_]+)+)'\s*,/g)) codes.add(m[1]);
  return codes;
}

/** Нарушения; пустой список — выкладывать можно. */
export function findViolations({ routes, codes, catalogue, allowlist }) {
  const allowedRoutes = allowlist.routes ?? {};
  const allowedCodes = allowlist.missingCodes ?? {};
  const problems = [];
  for (const r of routes) {
    if (!r.underAuth || !r.hasElement || r.hasChildren) continue;
    const tags = [...r.tags];
    const guarded = tags.some((t) => GUARD_TAGS.has(t));
    const redirectOnly = tags.length > 0 && tags.every((t) => REDIRECT_TAGS.has(t));
    if (guarded || redirectOnly || r.path in allowedRoutes) continue;
    problems.push(
      r.tags.has(SUPERADMIN_TAG)
        ? `${r.path}: только суперадминистратор. Заведите своё право (никому не выданное) и оберните страницу в RequirePermission.`
        : `${r.path}: нет проверки права. Оберните страницу в RequirePermission с кодом из каталога ролей.`,
    );
  }
  if (catalogue) {
    for (const code of [...codes].sort()) {
      if (!catalogue.has(code) && !(code in allowedCodes)) {
        problems.push(`право «${code}» не заведено в каталоге ролей бэкенда (sync_permissions) — его не будет в редакторе ролей.`);
      }
    }
  }
  return problems;
}

/** Исключения, которым больше ничего не соответствует. */
export function staleAllowlist({ routes, codes, allowlist }) {
  const paths = new Set(routes.map((r) => r.path));
  return [
    ...Object.keys(allowlist.routes ?? {}).filter((p) => !paths.has(p)),
    ...Object.keys(allowlist.missingCodes ?? {}).filter((c) => !codes.has(c)),
  ];
}

/** Полная проверка репозитория фронта (пути — от корня репозитория). */
export function checkRepo({ root = ".", backendPermissionsFile } = {}) {
  const app = fs.readFileSync(`${root}/src/App.tsx`, "utf8");
  const registry = fs.readFileSync(`${root}/src/config/accessPermissions.ts`, "utf8");
  const allowlist = JSON.parse(fs.readFileSync(`${root}/scripts/route-guards-allowlist.json`, "utf8"));
  const { routes, literals } = collectRoutes(app);
  const codes = new Set([...registryCodes(registry), ...literals]);
  const catalogue = backendPermissionsFile ? catalogueCodes(fs.readFileSync(backendPermissionsFile, "utf8")) : null;
  return {
    routes,
    problems: findViolations({ routes, codes, catalogue, allowlist }),
    stale: staleAllowlist({ routes, codes, allowlist }),
  };
}
