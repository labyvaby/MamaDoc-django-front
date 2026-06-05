import type { DataProvider } from "@refinedev/core";

/**
 * Safe no-op DataProvider for Django mode.
 * Prevents any accidental Supabase CRUD via Refine hooks (useList, useCreate, etc.)
 * when IS_DJANGO_BACKEND=true. All methods throw a clear error so stale
 * Refine hook calls are visible in the console rather than silently querying Supabase.
 */
const blocked = (method: string) => (): never => {
  throw new Error(
    `[Django mode] Refine dataProvider.${method}() called — this page still uses legacy Supabase hooks. Block the route with LegacyRouteGuard or migrate to Django API.`
  );
};

export const djangoDataProvider: DataProvider = {
  getList: blocked("getList"),
  create: blocked("create"),
  update: blocked("update"),
  deleteOne: blocked("deleteOne"),
  getOne: blocked("getOne"),
  getApiUrl: () => "/api",
  getMany: blocked("getMany"),
  createMany: blocked("createMany"),
  updateMany: blocked("updateMany"),
  deleteMany: blocked("deleteMany"),
  custom: blocked("custom"),
};
