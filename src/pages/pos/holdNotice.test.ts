import { describe, expect, it } from "vitest";

import type { PosSavedReceipt } from "../../api/pos";
import { heldNoticeFor } from "./holdNotice";

const receipt = { number: "3f2a8b1c-1234-4567-89ab-cdef01234567", status: "held" } as PosSavedReceipt;

describe("held receipt notice", () => {
  it("names the receipt by the same short number the held list shows", () => {
    expect(heldNoticeFor(receipt, "  Айгуль, вечером  ")).toMatchObject({
      title: "Чек №3f2a8b1c отложен",
      comment: "Айгуль, вечером",
    });
  });

  it("still confirms the hold when the response has no receipt", () => {
    expect(heldNoticeFor(null, "").title).toBe("Чек отложен");
  });
});
