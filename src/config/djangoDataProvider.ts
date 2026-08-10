import type { DataProvider } from "@refinedev/core";

/**
 * Safe no-op DataProvider for Django mode.
 * Prevents accidental legacy CRUD calls via Refine hooks. Returns rejected
 * Promises (not sync throws) so that
 * stale Refine hook calls become console errors rather than ErrorBoundary crashes.
 */
const blocked = (method: string) => (): Promise<never> => {
  const msg = `[Django mode] Refine dataProvider.${method}() called — migrate this page to the Django API.`;
  console.error(msg);
  return Promise.reject(new Error(msg));
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
