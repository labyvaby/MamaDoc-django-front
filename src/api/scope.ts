export interface Scope {
  organizationId?: number;
  branchId?: number;
}

/** Явный маркер «намеренно без филиала / на уровень всей орг» — greppable, виден в ревью. */
export const ORG_WIDE: Scope = {};

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
