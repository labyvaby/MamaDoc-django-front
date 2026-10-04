import { describe, expect, it } from "vitest";
import { micErrorCode } from "./microphone";

const domError = (name: string) => new DOMException("x", name);

describe("micErrorCode", () => {
  it("отказ в доступе", () => {
    expect(micErrorCode(domError("NotAllowedError"))).toBe("mic_denied");
    expect(micErrorCode(domError("SecurityError"))).toBe("mic_denied");
  });

  it("нет устройства", () => {
    expect(micErrorCode(domError("NotFoundError"))).toBe("mic_missing");
    expect(micErrorCode(domError("OverconstrainedError"))).toBe("mic_missing");
  });

  it("микрофон занят другой программой", () => {
    expect(micErrorCode(domError("NotReadableError"))).toBe("mic_busy");
    expect(micErrorCode(domError("AbortError"))).toBe("mic_busy");
  });

  it("прочее — браузер не умеет", () => {
    expect(micErrorCode(new Error("x"))).toBe("unsupported");
    expect(micErrorCode(domError("TypeError"))).toBe("unsupported");
  });
});
