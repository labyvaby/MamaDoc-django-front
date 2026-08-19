import { describe, it, expect, vi, beforeEach } from "vitest";

class FakeApiError extends Error {
  status: number;
  constructor(status: number) {
    super("fail");
    this.status = status;
  }
}

const apiRequest = vi.fn().mockResolvedValue(undefined);
vi.mock("./client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  ApiError: FakeApiError,
}));
vi.mock("./uploads", () => ({
  preparePhotoOrThrow: vi.fn(),
  withUploadErrors: vi.fn(),
}));

const { deleteInvoicePhoto, isLegacyExpensePhoto } = await import("./invoicePhotos");

const LEGACY_UNIFIED = "/finance/expenses/1121/invoices/-1121/?organizationId=1";
const LEGACY_FALLBACK = "/finance/expenses/1121/photo/?organizationId=1";

/**
 * Старый одиночный чек расхода приходит в списке накладных с отрицательным id
 * (`-expense.pk`). Бэк починил маршрут (конвертер под `-?\d+`, ответ
 * 19.08.2026), поэтому идём единой ручкой; фолбэк на прежний адрес срабатывает
 * только на 404 — то есть пока бэк не выложен.
 */
describe("deleteInvoicePhoto", () => {
  beforeEach(() => apiRequest.mockReset().mockResolvedValue(undefined));

  it("старый чек расхода удаляет единой ручкой", async () => {
    await deleteInvoicePhoto("expense", 1121, -1121, 1);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith(LEGACY_UNIFIED, { method: "DELETE" });
  });

  it("на 404 старый чек уходит на прежнюю ручку", async () => {
    apiRequest
      .mockRejectedValueOnce(new FakeApiError(404))
      .mockResolvedValueOnce(undefined);
    await deleteInvoicePhoto("expense", 1121, -1121, 1);
    expect(apiRequest).toHaveBeenNthCalledWith(1, LEGACY_UNIFIED, { method: "DELETE" });
    expect(apiRequest).toHaveBeenNthCalledWith(2, LEGACY_FALLBACK, { method: "DELETE" });
  });

  it("другую ошибку не глушит вторым запросом", async () => {
    apiRequest.mockRejectedValueOnce(new FakeApiError(500));
    await expect(deleteInvoicePhoto("expense", 1121, -1121, 1)).rejects.toThrow();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("обычное фото удаляет своим адресом и без фолбэка", async () => {
    apiRequest.mockRejectedValueOnce(new FakeApiError(404));
    await expect(deleteInvoicePhoto("expense", 1121, 7, 1)).rejects.toThrow();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith(
      "/finance/expenses/1121/invoices/7/?organizationId=1",
      { method: "DELETE" },
    );
  });

  it("у партии и движения отрицательных id не бывает — путь обычный", async () => {
    await deleteInvoicePhoto("vaccinationBatch", 5, 3);
    expect(apiRequest).toHaveBeenCalledWith(
      "/vaccinations/batches/5/invoices/3/",
      { method: "DELETE" },
    );
  });

  it("isLegacyExpensePhoto различает сущности", () => {
    expect(isLegacyExpensePhoto("expense", -1)).toBe(true);
    expect(isLegacyExpensePhoto("expense", 1)).toBe(false);
    expect(isLegacyExpensePhoto("stockMovement", -1)).toBe(false);
  });
});
