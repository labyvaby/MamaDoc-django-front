import { describe, it, expect } from "vitest";

import type { CatalogModule, FeatureSignals, ModuleRequest } from "../api/tenancy";
import {
  buildStorefront,
  bundleTarget,
  formatPrice,
  includedTarget,
  itemTarget,
  searchStorefront,
  shelfOrder,
  storefrontVertical,
  type StorefrontView,
} from "./moduleStorefrontModel";

const mod = (code: string, isEnabled = false, requires: string[] = [], name = code, category = "ops"): CatalogModule => ({
  code, name, description: `${name} — описание`, category, tier: "shared", isEnabled, requires,
});
const request = (productId: string, moduleCodes: string[]): ModuleRequest => ({
  id: 1, productId, productTitle: productId, moduleCodes, status: "new", createdAt: "2026-09-26T10:00:00Z",
});
const NO_FEATURES: FeatureSignals = { onlineBooking: false, site: false, insurers: false, notifications: false, odoctor: false };
const build = (
  catalog: CatalogModule[],
  vertical: string | null = "clinic",
  openRequests: ModuleRequest[] = [],
  signals: FeatureSignals | null = null,
  operator = false,
) => buildStorefront({ catalog, vertical, openRequests, signals, operator });

const item = (view: StorefrontView, id: string) => view.items.find((i) => i.product.id === id);
const included = (view: StorefrontView, id: string) => view.included.find((i) => i.card.id === id);
/** Что продаётся сейчас: без «Скоро». */
const onSale = (view: StorefrontView) => view.items.filter((i) => !i.product.soon).map((i) => i.product.id);

describe("formatPrice", () => {
  it("prints som per month with a non-breaking thousands gap", () => {
    expect(formatPrice(5000)).toBe("5 000 сом/мес");
    expect(formatPrice(500)).toBe("500 сом/мес");
  });
});

describe("storefrontVertical", () => {
  it("keeps known kinds of business and shows the clinic storefront to the rest", () => {
    expect(["beauty", "retail", "clinic", "fitness", null].map(storefrontVertical)).toEqual([
      "beauty", "retail", "clinic", "clinic", "clinic",
    ]);
  });
});

describe("buildStorefront", () => {
  it("sells paid products and moves base and retired modules to the package", () => {
    const view = build([mod("chatwoot"), mod("appointments", true), mod("achievements", true), mod("reports", true)]);
    expect(onSale(view)).toEqual(["chats"]);
    expect(view.included.map((i) => i.card.id)).toEqual([
      "dashboard", "automations", "conclusions", "appointments", "reports", "staff", "achievements",
    ]);
  });

  it("shows a product only when all its modules are in the organization's catalog", () => {
    expect(build([mod("warehouse")]).items.map((i) => i.product.id)).not.toContain("trade");
  });

  it("counts a multi-module product as connected only when every module is on", () => {
    const trade = item(build([mod("warehouse", true), mod("pos", false, ["warehouse"])]), "trade")!;
    expect(trade.status).toBe("available");
    expect(trade.requestModules).toEqual(["pos"]);
  });

  it("adds missing requirements to the request, naming those outside the product", () => {
    const view = build(
      [
        mod("loyalty", false, ["pos", "clients"]),
        mod("pos", false, ["warehouse"], "Касса магазина (POS)"),
        mod("warehouse", false, [], "Склад"),
        mod("clients", true),
      ],
      "retail",
    );
    const loyalty = item(view, "loyalty")!;
    expect(loyalty.requestModules).toEqual(["warehouse", "pos", "loyalty"]);
    expect(loyalty.extraRequirementNames).toEqual(["Склад", "Касса магазина (POS)"]);
  });

  it("marks a product requested by its own or a covering bundle request", () => {
    const own = build([mod("chatwoot")], "clinic", [request("chats", ["chatwoot"])]);
    expect(item(own, "chats")!.status).toBe("requested");
    const viaBundle = build([mod("deals")], "clinic", [request("bundle:more-bookings", ["chatwoot", "deals", "waitlist"])]);
    expect(item(viaBundle, "deals")!.status).toBe("requested");
  });

  it("puts an unknown module on sale at a price on request, in its own words", () => {
    const gizmo = item(build([mod("gizmo", false, [], "Гизмо", "communication")]), "gizmo")!;
    expect(gizmo.product).toMatchObject({
      id: "gizmo", title: "Гизмо", price: null, category: "communication", tagline: "Гизмо — описание",
    });
  });

  it("makes attendance free once payroll is connected", () => {
    const attendance = item(build([mod("payroll", true), mod("attendance")]), "attendance")!;
    expect(attendance.free).toBe(true);
    expect(attendance.freeWithTitle).toBe("Зарплата");
  });

  it("recommends bundles with something left to connect, pricing only what is missing", () => {
    const view = build([mod("chatwoot", true), mod("deals"), mod("waitlist"), mod("payroll"), mod("attendance"), mod("tasks")]);
    expect(view.bundles.map((b) => [b.bundle.id, b.price])).toEqual([["more-bookings", 3500], ["team", 6000]]);
    expect(view.bundles[0].requestModules).toEqual(["deals", "waitlist"]);
  });

  it("prices a bundle on request when a missing product has no price", () => {
    const view = build([mod("loyalty"), mod("promotions"), mod("telegram_bot")], "retail");
    expect(view.bundles[0]).toMatchObject({ price: null });
    expect(view.bundles[0].bundle.id).toBe("returning-buyers");
  });

  it("hides a bundle when everything missing is already requested or connected", () => {
    const view = build([mod("chatwoot", true), mod("deals"), mod("waitlist")], "clinic", [
      request("bundle:more-bookings", ["deals", "waitlist"]),
    ]);
    expect(view.bundles.map((b) => b.bundle.id)).not.toContain("more-bookings");
  });

  it("falls back to clinic bundles for an unknown vertical", () => {
    expect(build([mod("deals")], "hotel").bundles.map((b) => b.bundle.id)).toEqual(["more-bookings"]);
  });

  it("counts connected and available products, leaving upcoming ones out, and lists present categories", () => {
    const view = build([mod("chatwoot", true), mod("deals"), mod("payroll")]);
    expect([view.connectedCount, view.availableCount]).toEqual([1, 2]);
    expect(view.categories.map((c) => c.id)).toEqual(["clients", "communication", "team", "medicine"]);
  });
});

describe("features without a module", () => {
  it("take their status from the server signals and an open request", () => {
    const view = build([], "clinic", [request("site", [])], { ...NO_FEATURES, onlineBooking: true });
    expect(["online_booking", "site", "insurers", "odoctor"].map((id) => item(view, id)!.status)).toEqual([
      "connected", "requested", "available", "available",
    ]);
    expect(item(view, "insurers")!.requestModules).toEqual([]);
    const operator = build([], "clinic", [], { ...NO_FEATURES, notifications: true }, true);
    expect(item(operator, "notifications")!.status).toBe("connected");
  });

  it("stay hidden while the signals are unknown", () => {
    expect(onSale(build([]))).toEqual([]);
  });

  it("are offered only to the kinds of business they are for", () => {
    const retail = build([], "retail", [], NO_FEATURES).items.map((i) => i.product.id);
    expect(retail).toEqual(["ai_analyst"]);
    const beauty = build([], "beauty", [], NO_FEATURES).items.map((i) => i.product.id);
    expect(beauty).toEqual(["online_booking", "site", "ai_analyst"]);
  });
});

describe("inactive products", () => {
  it("are hidden from the clinic and shown to the operator with the reason", () => {
    expect(item(build([], "clinic", [], NO_FEATURES), "notifications")).toBeUndefined();
    const notifications = item(build([], "clinic", [], NO_FEATURES, true), "notifications")!;
    expect(notifications.status).toBe("available");
    expect(notifications.product.inactive?.reason).toBeTruthy();
  });

  it("are not counted and stand last on the operator's shelf", () => {
    const catalog = [mod("chatwoot", true), mod("deals")];
    const clinic = build(catalog, "clinic", [], NO_FEATURES);
    const operator = build(catalog, "clinic", [], NO_FEATURES, true);
    expect(operator.items.length).toBe(clinic.items.length + 1);
    expect([operator.connectedCount, operator.availableCount]).toEqual([clinic.connectedCount, clinic.availableCount]);
    const shelf = shelfOrder(operator.items).map((i) => i.product.id);
    expect(shelf[shelf.length - 1]).toBe("notifications");
  });
});

describe("upcoming products", () => {
  it("are shown as soon, and a request marks them requested", () => {
    expect(item(build([]), "lab")!.status).toBe("soon");
    expect(item(build([], "clinic", [request("lab", [])]), "lab")!.status).toBe("requested");
    expect(itemTarget(item(build([]), "lab")!)).toEqual({
      productId: "lab", title: "Лаборатория", modules: [], extraRequirementNames: [], kind: "soon",
    });
  });
});

describe("the package section", () => {
  it("shows base modules as included, off or requested, and features without a module as included", () => {
    const view = build([mod("reports", true), mod("finance"), mod("documents")], "clinic", [
      request("documents", ["documents"]),
    ]);
    expect(["reports", "finance", "documents", "staff"].map((id) => included(view, id)!.status)).toEqual([
      "included", "off", "requested", "included",
    ]);
    expect(included(view, "staff")!.module).toBeNull();
  });

  it("hides a retired module from the clinic while it is off, but not from the operator", () => {
    expect(included(build([mod("achievements")]), "achievements")).toBeUndefined();
    expect(included(build([mod("achievements")], "clinic", [], null, true), "achievements")!.status).toBe("off");
  });

  it("gives the operator every catalog module that has no product or card", () => {
    const clients = mod("clients", false, [], "Клиенты");
    expect(included(build([clients]), "clients")).toBeUndefined();
    const operator = included(build([clients], "clinic", [], null, true), "clients")!;
    expect(operator).toMatchObject({ status: "off", module: clients });
    expect(operator.card).toMatchObject({ title: "Клиенты", tagline: "Клиенты — описание" });
  });

  it("uses the words of the kind of business", () => {
    const catalog = [mod("appointments", true), mod("patients", true), mod("clients", true)];
    const ids = (vertical: string) => build(catalog, vertical).included.map((i) => i.card.id);
    expect(ids("clinic")).toEqual(expect.arrayContaining(["appointments", "patients"]));
    expect(ids("clinic")).not.toContain("visits");
    expect(ids("beauty")).toEqual(expect.arrayContaining(["visits", "clients"]));
    expect(ids("beauty")).not.toContain("conclusions");
  });

  it("requests an off module together with its missing requirements", () => {
    const view = build([mod("reports", false, ["finance"]), mod("finance", false, [], "Финансы")]);
    expect(includedTarget(included(view, "reports")!)).toEqual({
      productId: "reports", title: "Отчёты", modules: ["finance", "reports"], extraRequirementNames: ["Финансы"], kind: "included",
    });
  });
});

describe("request targets", () => {
  it("builds a product request and a bundle request", () => {
    const view = build([mod("chatwoot"), mod("deals"), mod("waitlist")]);
    expect(itemTarget(item(view, "chats")!)).toEqual({
      productId: "chats", title: "Чаты", modules: ["chatwoot"], extraRequirementNames: [], kind: "product",
    });
    expect(bundleTarget(view.bundles[0])).toMatchObject({
      productId: "bundle:more-bookings", title: "Больше записей, меньше потерь", modules: ["chatwoot", "deals", "waitlist"], kind: "bundle",
    });
  });
});

describe("shelfOrder", () => {
  it("shows what can be connected first, then requested, then upcoming, then connected", () => {
    const view = build([mod("chatwoot", true), mod("deals"), mod("waitlist")], "clinic", [request("waitlist", ["waitlist"])]);
    expect(shelfOrder(view.items).map((i) => i.product.id)).toEqual(["deals", "waitlist", "ai_analyst", "lab", "chats"]);
  });
});

describe("searchStorefront", () => {
  it("finds a product by one of its parts and names the part", () => {
    const view = build([mod("warehouse"), mod("pos", false, ["warehouse"])]);
    const found = searchStorefront(view, "инвентар");
    expect(found.items.map((r) => [r.item.product.id, r.parts])).toEqual([["trade", ["Инвентаризация"]]]);
  });

  it("ignores case and ё, and needs every word", () => {
    const view = build([mod("payroll"), mod("tasks")]);
    expect(searchStorefront(view, "ОТЧЕТ по зп").items.map((r) => r.item.product.id)).toEqual(["payroll"]);
    expect(searchStorefront(view, "отчёт склад").items).toEqual([]);
  });

  it("looks into the package cards too", () => {
    const found = searchStorefront(build([mod("appointments", true)]), "регистратура");
    expect(found.included.map((r) => [r.item.card.id, r.parts])).toEqual([["appointments", ["Регистратура"]]]);
  });

  it("returns everything in shelf order for an empty query", () => {
    const view = build([mod("chatwoot", true), mod("deals")]);
    const found = searchStorefront(view, "  ");
    expect(found.items.map((r) => r.item)).toEqual(shelfOrder(view.items));
    expect(found.included.map((r) => r.item)).toEqual(view.included);
  });
});
