import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  switchAuthContext: vi.fn(),
}));

import { switchAuthContext } from "../api";
import { addContextSwitchGuard, switchContext } from "./usePermissions";

const mocked = vi.mocked(switchAuthContext);

describe("switchContext — охранники смены контекста", () => {
  const removers: Array<() => void> = [];
  afterEach(() => {
    removers.splice(0).forEach((remove) => remove());
    mocked.mockReset();
  });

  it("причина охранника отклоняет переключение до запроса к бэку", async () => {
    removers.push(addContextSwitchGuard(() => "Идёт запись приёма"));
    await expect(switchContext({ membershipId: 1, branchId: 2 })).rejects.toThrow("Идёт запись приёма");
    expect(mocked).not.toHaveBeenCalled();
  });

  it("снятый охранник больше не мешает", async () => {
    const remove = addContextSwitchGuard(() => "Идёт запись приёма");
    remove();
    removers.push(addContextSwitchGuard(() => null));
    mocked.mockRejectedValue(new Error("сеть"));
    await expect(switchContext({ membershipId: 1, branchId: 2 })).rejects.toThrow("сеть");
    expect(mocked).toHaveBeenCalledTimes(1);
  });
});
