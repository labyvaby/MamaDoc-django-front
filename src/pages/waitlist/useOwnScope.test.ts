import { describe, expect, it } from "vitest";
import { seesOwnWaitlistOnly } from "./useOwnScope";

describe("seesOwnWaitlistOnly", () => {
  it("сужает клинициста без waitlist.view_all", () => {
    expect(seesOwnWaitlistOnly({ isSuperAdmin: false, canViewAll: false, hasEmployee: true })).toBe(true);
  });

  it("не сужает того, у кого есть view_all", () => {
    expect(seesOwnWaitlistOnly({ isSuperAdmin: false, canViewAll: true, hasEmployee: true })).toBe(false);
  });

  it("не сужает суперадмина даже без права и без карточки", () => {
    expect(seesOwnWaitlistOnly({ isSuperAdmin: true, canViewAll: false, hasEmployee: true })).toBe(false);
    expect(seesOwnWaitlistOnly({ isSuperAdmin: true, canViewAll: false, hasEmployee: false })).toBe(false);
  });

  it("не сужает роль без карточки сотрудника — бэк ей сужать не до чего", () => {
    expect(seesOwnWaitlistOnly({ isSuperAdmin: false, canViewAll: false, hasEmployee: false })).toBe(false);
  });
});
