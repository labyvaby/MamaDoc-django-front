import { describe, it, expect } from "vitest";

import type { CatalogModule, ModuleRequest } from "../api/tenancy";
import { buildStorefront, bundleTarget, formatPrice, itemTarget, shelfOrder } from "./moduleStorefrontModel";

const mod = (code: string, isEnabled = false, requires: string[] = [], name = code, category = "ops"): CatalogModule => ({
  code, name, description: `${name} — описание`, category, tier: "shared", isEnabled, requires,
});
const request = (productId: string, moduleCodes: string[]): ModuleRequest => ({
  id: 1, productId, productTitle: productId, moduleCodes, status: "new", createdAt: "2026-09-26T10:00:00Z",
});
const build = (catalog: CatalogModule[], vertical: string | null = "clinic", openRequests: ModuleRequest[] = []) =>
  buildStorefront({ catalog, vertical, openRequests });

describe("formatPrice", () => {
  it("prints som per month with a thousands gap", () => {
    expect(formatPrice(5000)).toBe("5 000 сом/мес");
    expect(formatPrice(500)).toBe("500 сом/мес");
  });
});

describe("buildStorefront", () => {
  it("sells paid products and keeps base and retired modules in the package", () => {
    const view = build([mod("chatwoot"), mod("appointments", true), mod("achievements", true), mod("reports", true)]);
    expect(view.items.map((i) => i.product.id)).toEqual(["chats"]);
    expect(view.basePackage.map((m) => m.code).sort()).toEqual(["achievements", "appointments", "reports"]);
  });

  it("shows a product only when all its modules are in the organization's catalog", () => {
    expect(build([mod("warehouse")]).items.map((i) => i.product.id)).not.toContain("trade");
  });

  it("counts a multi-module product as connected only when every module is on", () => {
    const trade = build([mod("warehouse", true), mod("pos", false, ["warehouse"])]).items.find((i) => i.product.id === "trade")!;
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
    const loyalty = view.items.find((i) => i.product.id === "loyalty")!;
    expect(loyalty.requestModules).toEqual(["warehouse", "pos", "loyalty"]);
    expect(loyalty.extraRequirementNames).toEqual(["Склад", "Касса магазина (POS)"]);
  });

  it("marks a product requested by its own or a covering bundle request", () => {
    const own = build([mod("chatwoot")], "clinic", [request("chats", ["chatwoot"])]);
    expect(own.items[0].status).toBe("requested");
    const viaBundle = build([mod("deals")], "clinic", [request("bundle:more-bookings", ["chatwoot", "deals", "waitlist"])]);
    expect(viaBundle.items[0].status).toBe("requested");
  });

  it("puts an unknown module on sale at a price on request, in its own words", () => {
    const gizmo = build([mod("gizmo", false, [], "Гизмо", "communication")]).items[0];
    expect(gizmo.product).toMatchObject({
      id: "gizmo", title: "Гизмо", price: null, category: "communication", tagline: "Гизмо — описание",
    });
  });

  it("makes attendance free once payroll is connected", () => {
    const view = build([mod("payroll", true), mod("attendance")]);
    const attendance = view.items.find((i) => i.product.id === "attendance")!;
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

  it("counts connected and available products and lists present categories", () => {
    const view = build([mod("chatwoot", true), mod("deals"), mod("payroll")]);
    expect([view.connectedCount, view.availableCount]).toEqual([1, 2]);
    expect(view.categories.map((c) => c.id)).toEqual(["clients", "communication", "team"]);
  });
});

describe("request targets", () => {
  it("builds a product request and a bundle request", () => {
    const view = build([mod("chatwoot"), mod("deals"), mod("waitlist")]);
    expect(itemTarget(view.items[0])).toEqual({
      productId: "chats", title: "Чаты", modules: ["chatwoot"], extraRequirementNames: [],
    });
    expect(bundleTarget(view.bundles[0])).toMatchObject({
      productId: "bundle:more-bookings", title: "Больше записей, меньше потерь", modules: ["chatwoot", "deals", "waitlist"],
    });
  });
});

describe("shelfOrder", () => {
  it("shows what can be connected first, then requested, then connected", () => {
    const view = build([mod("chatwoot", true), mod("deals"), mod("waitlist")], "clinic", [request("waitlist", ["waitlist"])]);
    expect(shelfOrder(view.items).map((i) => i.product.id)).toEqual(["deals", "waitlist", "chats"]);
  });
});
