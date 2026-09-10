import { describe, expect, it } from "vitest";

import { planOfficeIpSave } from "./officeIpSave";
import type { OfficeIpFormState, OfficeIpServerState } from "./officeIpSave";

/**
 * Поле IP — Autocomplete: набранный текст становится значением только по Enter.
 * Пока план сохранения этого не учитывал, клик по «Сохранить» сразу после
 * ввода не отправлял PATCH вообще — и показывал «сохранено».
 */

const form = (over: Partial<OfficeIpFormState> = {}): OfficeIpFormState => ({
  ips: [],
  ipsInput: "",
  branchIps: {},
  branchIpsInput: {},
  ...over,
});

const server = (over: Partial<OfficeIpServerState> = {}): OfficeIpServerState => ({
  officeIp: "",
  branches: [{ branchId: 14, officeIp: "" }],
  ...over,
});

describe("недобранный текст поля", () => {
  it("уходит в запрос, даже если Enter не нажимали", () => {
    const plan = planOfficeIpSave(
      form({ branchIps: { 14: [] }, branchIpsInput: { 14: "212.42.103.90" } }),
      server(),
    );
    expect(plan.branches).toEqual([
      { branchId: 14, officeIp: "212.42.103.90" },
    ]);
    expect(plan.nextBranchIps[14]).toEqual(["212.42.103.90"]);
  });

  it("дополняет уже подтверждённые чипы, а не заменяет их", () => {
    const plan = planOfficeIpSave(
      form({ ips: ["10.0.0.1"], ipsInput: "10.0.0.2" }),
      server(),
    );
    expect(plan.orgIp).toBe("10.0.0.1, 10.0.0.2");
  });

  it("не плодит дубликаты", () => {
    const plan = planOfficeIpSave(
      form({ ips: ["10.0.0.1"], ipsInput: "10.0.0.1" }),
      server({ officeIp: "10.0.0.1" }),
    );
    expect(plan.orgIp).toBeNull();
  });
});

describe("что отправляется", () => {
  it("ничего, когда пользователь ничего не менял", () => {
    const plan = planOfficeIpSave(
      form({ ips: ["10.0.0.1"], branchIps: { 14: ["10.0.0.2"] } }),
      server({
        officeIp: "10.0.0.1",
        branches: [{ branchId: 14, officeIp: "10.0.0.2" }],
      }),
    );
    expect(plan.orgIp).toBeNull();
    expect(plan.branches).toEqual([]);
  });

  it("очистка поля — это тоже изменение (пустая строка уходит на бэк)", () => {
    const plan = planOfficeIpSave(
      form({ branchIps: { 14: [] } }),
      server({ branches: [{ branchId: 14, officeIp: "10.0.0.2" }] }),
    );
    expect(plan.branches).toEqual([{ branchId: 14, officeIp: "" }]);
  });
});

describe("несколько филиалов", () => {
  const threeBranches = server({
    officeIp: "10.0.0.1",
    branches: [
      { branchId: 1, officeIp: "10.0.1.1" },
      { branchId: 12, officeIp: "10.0.12.1" },
      { branchId: 13, officeIp: "" },
    ],
  });

  it("уходит только изменившийся филиал, соседние не трогаются", () => {
    const plan = planOfficeIpSave(
      form({
        ips: ["10.0.0.1"],
        branchIps: { 1: ["10.0.1.1"], 12: ["10.0.12.1"], 13: [] },
        branchIpsInput: { 13: "10.0.13.1" },
      }),
      threeBranches,
    );
    expect(plan.orgIp).toBeNull();
    expect(plan.branches).toEqual([{ branchId: 13, officeIp: "10.0.13.1" }]);
  });

  it("у каждого филиала свой список — правки не перетекают между ними", () => {
    const plan = planOfficeIpSave(
      form({
        ips: ["10.0.0.1"],
        branchIps: { 1: ["10.0.1.1", "10.0.1.2"], 12: ["10.0.12.1"], 13: [] },
        branchIpsInput: { 12: "10.0.12.2" },
      }),
      threeBranches,
    );
    expect(plan.branches).toEqual([
      { branchId: 1, officeIp: "10.0.1.1, 10.0.1.2" },
      { branchId: 12, officeIp: "10.0.12.1, 10.0.12.2" },
    ]);
    expect(plan.nextBranchIps[13]).toEqual([]);
  });

  it("филиал, которого нет в форме, не затирается пустым значением", () => {
    // Филиал 12 завели, пока страница была открыта: он есть в ответе бэка,
    // но в состоянии формы его нет — трогать его нельзя.
    const plan = planOfficeIpSave(
      form({ ips: ["10.0.0.1"], branchIps: { 1: ["10.0.1.1"], 13: [] } }),
      threeBranches,
    );
    expect(plan.branches).toEqual([]);
    expect(plan.nextBranchIps).not.toHaveProperty("12");
  });
});
