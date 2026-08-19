import { describe, it, expect, vi, beforeEach } from "vitest";

const apiRequest = vi.fn().mockResolvedValue(undefined);
vi.mock("./client", () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));
vi.mock("./uploads", () => ({
  preparePhotoOrThrow: vi.fn(),
  withUploadErrors: vi.fn(),
}));

const { deleteInvoicePhoto, isLegacyExpensePhoto } = await import("./invoicePhotos");

/**
 * Старый одиночный чек расхода приходит в списке накладных с отрицательным id
 * (`-expense.pk`). Бэк заявлял, что по нему же работает DELETE, но роут такой
 * адрес не матчит («Page not found», проверено на проде 19.08.2026), поэтому
 * для него зовём прежнюю ручку одиночного фото.
 */
describe("deleteInvoicePhoto", () => {
  beforeEach(() => apiRequest.mockClear());

  it("старый чек расхода удаляет прежней ручкой", async () => {
    await deleteInvoicePhoto("expense", 1121, -1121, 1);
    expect(apiRequest).toHaveBeenCalledWith(
      "/finance/expenses/1121/photo/?organizationId=1",
      { method: "DELETE" },
    );
  });

  it("обычное фото удаляет своим адресом", async () => {
    await deleteInvoicePhoto("expense", 1121, 7, 1);
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
