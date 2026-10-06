// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n/index";
import { PatientConclusionHistoryPanel } from "./PatientConclusionHistoryPanel";
import { getMedicalConclusion, getPatientConclusionHistoryPage, type MedicalConclusion, type PatientConclusionSummary } from "../../api/medical";

vi.mock("../../hooks/usePermissions", () => ({ usePermissions: () => ({
  employeeId: "50", activeEmployee: { id: 48 }, activeMembership: { id: 57 },
  activeBranch: { id: 14 }, activeOrganization: { id: 4 },
}) }));
vi.mock("../../hooks/useApiOrgId", () => ({ useApiOrgId: () => undefined }));
vi.mock("../../api/medical", () => ({ getMedicalConclusion: vi.fn(), getPatientConclusionHistoryPage: vi.fn() }));

const row = (id: number, doctorId = 48, appointmentId = id): PatientConclusionSummary => ({
  id, doctor: { id: doctorId, fullName: `Врач ${doctorId}` }, appointmentId, serviceLineId: id,
  occurredAt: "2026-09-07T10:00:00Z", serviceName: `Осмотр ${id}`, status: "completed", diagnosisData: [],
});
const saved: MedicalConclusion = {
  id: 1, appointmentId: 1, serviceLineId: 1, complaints: "Сохранённые жалобы", anamnesis: null,
  objective: null, conclusion: "Рекомендации", diagnosisData: [], photoUrls: [], weightKg: null,
  heightCm: null, temperature: null, internalComment: null, status: "completed",
  createdAt: "2026-09-07T10:00:00Z", updatedAt: "2026-09-07T10:00:00Z",
  formData: { version: 1, forms: [{ formId: 3, values: { exam: "Строка старого бланка" },
    snapshot: { title: "Протокол осмотра", name: "Осмотр", target: "anamnesis", fields: [{ id: "exam", label: "Осмотр", type: "textarea" }] } }],
    manual: { anamnesis: "Дописанный текст врача" } },
};
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const settle = async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
};
const button = (label: string) => Array.from(host.querySelectorAll("button")).find((item) => item.textContent?.includes(label))!;
const click = async (label: string) => { await act(async () => { button(label).click(); }); await settle(); };

beforeEach(() => {
  vi.resetAllMocks();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(getPatientConclusionHistoryPage).mockResolvedValue({ items: [row(1), row(2, 50), row(3, 48, 99)], nextOffset: null });
  vi.mocked(getMedicalConclusion).mockResolvedValue(saved);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); });
const render = async () => {
  await act(async () => { root.render(<QueryClientProvider client={client}><PatientConclusionHistoryPanel
    patientId={14159} currentAppointmentId={99} onClose={() => undefined} /></QueryClientProvider>); });
  await settle();
};

describe("patient history in a visit", () => {
  it("uses the employee id for My records and excludes this visit's documents", async () => {
    await render();
    expect(host.textContent).toContain("Осмотр 1");
    expect(host.textContent).not.toContain("Осмотр 2");
    expect(host.textContent).not.toContain("Осмотр 3");
    await click("Все врачи");
    expect(host.textContent).toContain("Осмотр 2");
    expect(host.textContent).not.toContain("Осмотр 3");
    expect(getPatientConclusionHistoryPage).toHaveBeenCalledWith(14159, 0, 4, expect.any(AbortSignal));
  });
  it("opens the saved form, bound columns and handwritten text without edit controls", async () => {
    await render(); await click("Осмотр 1");
    expect(host.textContent).toContain("Строка старого бланка");
    expect(host.textContent).toContain("Сохранённые жалобы");
    expect(host.textContent).toContain("Дописанный текст врача");
    expect(host.querySelector("textarea, input")).toBeNull();
    expect(getMedicalConclusion).toHaveBeenCalledWith(1, expect.any(AbortSignal), 4);
  });
  it("loads earlier pages even when the first page has no records by this doctor", async () => {
    vi.mocked(getPatientConclusionHistoryPage)
      .mockResolvedValueOnce({ items: [row(2, 50)], nextOffset: 50 })
      .mockResolvedValueOnce({ items: [row(1)], nextOffset: null });
    await render();
    expect(host.textContent).toContain("В загруженной части");
    await click("Загрузить более ранние");
    expect(host.textContent).toContain("Осмотр 1");
    expect(getPatientConclusionHistoryPage).toHaveBeenLastCalledWith(14159, 50, 4, expect.any(AbortSignal));
  });
  it("shows a load failure separately from an empty chart and retries", async () => {
    vi.mocked(getPatientConclusionHistoryPage).mockRejectedValueOnce(new Error("offline"));
    await render();
    expect(host.textContent).toContain("Не удалось загрузить");
    expect(host.textContent).not.toContain("пока нет");
    await click("Повторить");
    expect(host.textContent).toContain("Осмотр 1");
  });
  it("keeps the history list when a document fails and allows retry", async () => {
    vi.mocked(getMedicalConclusion).mockRejectedValueOnce(new Error("unavailable"));
    await render(); await click("Осмотр 1");
    expect(host.textContent).toContain("Не удалось открыть");
    expect(host.textContent).toContain("Осмотр 1");
    await click("Повторить");
    expect(host.textContent).toContain("Строка старого бланка");
  });
});
