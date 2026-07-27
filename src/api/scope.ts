export interface Scope {
  organizationId?: number;
  branchId?: number;
}

/**
 * Явный маркер «намеренно без филиала, но внутри своей организации» — greppable,
 * виден в ревью.
 *
 * Обязательно передавать `organizationId` активного скоупа (`useApiOrgId()`):
 * пустой Scope означает «орг определяет бэк по сессии», а для суперпользователя
 * и мультиорг-аккаунта это не та организация, которую видит пользователь.
 * `undefined` допустим — так useActiveScope помечает «одна орг, параметр не нужен».
 */
export function orgWide(organizationId: number | undefined): Scope {
  return organizationId != null ? { organizationId } : {};
}

/**
 * Преобразует объект Scope в URLSearchParams для передаче в API бэкенда.
 */
export function scopeParams(scope: Scope): URLSearchParams {
  const q = new URLSearchParams();
  if (scope.organizationId != null) {
    q.set("organizationId", String(scope.organizationId));
  }
  if (scope.branchId != null) {
    q.set("branchId", String(scope.branchId));
  }
  return q;
}
