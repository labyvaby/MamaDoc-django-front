import { describe, it, expect } from "vitest";

import { djangoQueryKeys } from "../api/queryKeys";
import { modulesCatalogQuery } from "./useModulesCatalog";

describe("modulesCatalogQuery", () => {
  it("sits under the prefix that an organization switch clears", () => {
    // DjangoQueryCacheReset (App.tsx) removes djangoQueryKeys.all on
    // switchContext(). Outside it the page kept the previous organization's
    // modules while its buttons already hit the new one.
    const key = modulesCatalogQuery(8).queryKey;
    expect(key.slice(0, djangoQueryKeys.all.length)).toEqual([...djangoQueryKeys.all]);
  });

  it("keeps each organization's catalog apart", () => {
    expect(modulesCatalogQuery(7).queryKey).not.toEqual(modulesCatalogQuery(8).queryKey);
  });

  it("falls under the tenancy root the page invalidates after a toggle", () => {
    const root = djangoQueryKeys.tenancy.all;
    expect(modulesCatalogQuery(8).queryKey.slice(0, root.length)).toEqual([...root]);
  });
});
