import { describe, expect, it } from "vitest";

import { EMPTY_REQUISITES } from "../../../api/organization";
import { changedRequisites, requisitesErrors } from "./requisitesForm";

describe("реквизиты", () => {
  it("ИНН — 14 цифр, ОКПО — цифры, пустые поля допустимы", () => {
    expect(requisitesErrors(EMPTY_REQUISITES)).toEqual({});
    expect(requisitesErrors({ ...EMPTY_REQUISITES, inn: "123", okpo: "31-15" })).toEqual({
      inn: "ИНН — 14 цифр",
      okpo: "ОКПО — только цифры",
    });
    expect(requisitesErrors({ ...EMPTY_REQUISITES, inn: " 00807202110267 " })).toEqual({});
  });

  it("отправляются только изменённые поля, с обрезкой пробелов", () => {
    const initial = { ...EMPTY_REQUISITES, okpo: "31157422" };
    expect(changedRequisites(initial, { ...initial, legalName: " ОсОО «Мама Доктор» " })).toEqual({
      legalName: "ОсОО «Мама Доктор»",
    });
    expect(changedRequisites(initial, initial)).toEqual({});
  });
});
