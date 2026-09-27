import { describe, expect, it } from "vitest";

import { deriveActiveScope } from "./useActiveScope";
import type { ActiveScopeInput } from "./useActiveScope";

/**
 * Скоуп решает, уйдёт ли запрос с organizationId. Ошибка здесь не видна в коде
 * страницы: список просто отвечает 400 «Суперпользователю необходимо указать
 * organizationId», и пользователь видит «Ошибка загрузки».
 */

const scope = (over: Partial<ActiveScopeInput> = {}) =>
  deriveActiveScope({
    isSuperAdmin: false,
    membershipCount: 1,
    organizationId: 1,
    branchId: 13,
    loading: false,
    ...over,
  });

describe("кому нужен organizationId в запросе", () => {
  it("обычному сотруднику одной организации — нет (бэк выводит из сессии)", () => {
    const s = scope();
    expect(s.organizationId).toBeUndefined();
    expect(s.orgReady).toBe(true);
  });

  it("суперпользователю — да", () => {
    expect(scope({ isSuperAdmin: true }).organizationId).toBe(1);
  });

  it("мультиорг-аккаунту — да", () => {
    expect(scope({ membershipCount: 2 }).organizationId).toBe(1);
  });
});

describe("orgReady — гейт для фетчей", () => {
  /**
   * Главный случай: /auth/me уже отработал (loading=false), но активная
   * организация ещё не приехала. Раньше страница продаж в этот момент
   * отправляла запрос без organizationId и показывала ошибку загрузки.
   */
  it("организация обязательна, но ещё неизвестна — не готовы", () => {
    const s = scope({ isSuperAdmin: true, organizationId: undefined });
    expect(s.isReady).toBe(true); // /auth/me отработал…
    expect(s.orgReady).toBe(false); // …но фетчить нельзя
  });

  it("организация обязательна и известна — готовы", () => {
    expect(scope({ isSuperAdmin: true, organizationId: 4 }).orgReady).toBe(true);
  });

  it("организация не обязательна — готовы даже без неё", () => {
    // Иначе у обычного сотрудника списки не грузились бы вовсе.
    expect(scope({ organizationId: undefined }).orgReady).toBe(true);
  });

  it("null от бэка равнозначен отсутствию", () => {
    expect(scope({ isSuperAdmin: true, organizationId: null }).orgReady).toBe(false);
  });
});

describe("остальные поля", () => {
  it("филиал прокидывается как есть", () => {
    expect(scope({ branchId: 7 }).branchId).toBe(7);
  });

  it("нет филиала — undefined («все филиалы»)", () => {
    expect(scope({ branchId: null }).branchId).toBeUndefined();
  });

  it("isReady отражает загрузку /auth/me", () => {
    expect(scope({ loading: true }).isReady).toBe(false);
    expect(scope({ loading: false }).isReady).toBe(true);
  });
});
