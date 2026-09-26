import { describe, expect, it } from "vitest";
import { parseKgPin } from "./kgPin";

describe("parseKgPin", () => {
  it("декодирует пол и дату рождения", () => {
    expect(parseKgPin("11604199201289")).toEqual({
      ok: true,
      gender: "female",
      birthDate: "1992-04-16",
    });
    expect(parseKgPin("20101201500001")).toEqual({
      ok: true,
      gender: "male",
      birthDate: "2015-01-01",
    });
  });

  it("отклоняет неполный и кривой ИНН", () => {
    expect(parseKgPin("1160419920128")).toEqual({ ok: false, error: "ИНН — 14 цифр" });
    expect(parseKgPin("1160419920128a")).toMatchObject({ ok: false });
    expect(parseKgPin("31604199201289")).toMatchObject({ ok: false });
    expect(parseKgPin("13102199201289")).toMatchObject({ ok: false });
    expect(parseKgPin("10101209901289")).toMatchObject({ ok: false });
  });
});
