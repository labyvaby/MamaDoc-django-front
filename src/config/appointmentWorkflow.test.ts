import { describe, expect, it } from "vitest";

import {
  APPOINTMENT_WORKFLOW_CONFIG_KEY,
  buildAppointmentWorkflowThemeConfig,
  readAppointmentWorkflow,
} from "./appointmentWorkflow";

describe("readAppointmentWorkflow", () => {
  it("по умолчанию шаг «Подтверждён» включён", () => {
    expect(readAppointmentWorkflow(null).confirmStep).toBe(true);
    expect(readAppointmentWorkflow({}).confirmStep).toBe(true);
    expect(readAppointmentWorkflow({ accentId: "teal" }).confirmStep).toBe(true);
  });

  it("читает сохранённое значение", () => {
    expect(
      readAppointmentWorkflow({ [APPOINTMENT_WORKFLOW_CONFIG_KEY]: { confirmStep: false } })
        .confirmStep,
    ).toBe(false);
  });

  it("мусор в свободном JSON не ломает настройку", () => {
    expect(
      readAppointmentWorkflow({ [APPOINTMENT_WORKFLOW_CONFIG_KEY]: { confirmStep: "no" } })
        .confirmStep,
    ).toBe(true);
    expect(
      readAppointmentWorkflow({ [APPOINTMENT_WORKFLOW_CONFIG_KEY]: "off" }).confirmStep,
    ).toBe(true);
  });
});

describe("buildAppointmentWorkflowThemeConfig", () => {
  it("патчит поверх остального themeConfig, не стирая палитру и терминологию", () => {
    const current = { accentId: "teal", glossary: { patient: {} }, landing: { slogan: "x" } };
    const next = buildAppointmentWorkflowThemeConfig(current, { confirmStep: false });
    expect(next).toEqual({
      ...current,
      [APPOINTMENT_WORKFLOW_CONFIG_KEY]: { confirmStep: false },
    });
    expect(current).not.toHaveProperty(APPOINTMENT_WORKFLOW_CONFIG_KEY);
  });

  it("значение по умолчанию убирает ключ вместо записи «всё как обычно»", () => {
    const next = buildAppointmentWorkflowThemeConfig(
      { accentId: "teal", [APPOINTMENT_WORKFLOW_CONFIG_KEY]: { confirmStep: false } },
      { confirmStep: true },
    );
    expect(next).toEqual({ accentId: "teal" });
  });
});
