import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("./client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
const preparePhotoIfImage = vi.fn(async (file: File) => file);
vi.mock("./uploads", () => ({
  preparePhotoIfImage: (file: File) => preparePhotoIfImage(file),
  withUploadErrors: <T>(run: () => Promise<T>) => run(),
}));
vi.mock("./protectedFile", () => ({
  protectedFilePath: (url: string) => `/api${url.slice(url.indexOf("/api/") + "/api".length)}`,
}));

const {
  attachmentSrc,
  deleteCardAttachment,
  listCardAttachments,
  renameCardAttachment,
  uploadCardAttachment,
} = await import("./attachments");

const patient = { kind: "patient" as const, id: 5 };
const client = { kind: "client" as const, id: 7, organizationId: 3 };

describe("card attachments API", () => {
  beforeEach(() => {
    apiRequest.mockReset().mockResolvedValue([]);
    preparePhotoIfImage.mockClear();
  });

  it("lists patient files on the v2 route without an organization", async () => {
    const signal = new AbortController().signal;
    await listCardAttachments(patient, signal);
    expect(apiRequest).toHaveBeenCalledWith("/v2/patients/5/attachments/", { signal });
  });

  it("names the organization for client files", async () => {
    await listCardAttachments(client);
    expect(apiRequest).toHaveBeenCalledWith("/v2/clients/7/attachments/?organizationId=3", { signal: undefined });
  });

  it("uploads one prepared file in the multipart field «file»", async () => {
    const file = new File(["%PDF-1.4"], "scan.pdf", { type: "application/pdf" });
    await uploadCardAttachment(client, file);

    expect(preparePhotoIfImage).toHaveBeenCalledWith(file);
    const [path, options] = apiRequest.mock.calls[0] as [string, { method: string; formData: FormData }];
    expect(path).toBe("/v2/clients/7/attachments/?organizationId=3");
    expect(options.method).toBe("POST");
    expect((options.formData.get("file") as File).name).toBe("scan.pdf");
  });

  it("renames and deletes by attachment id", async () => {
    await renameCardAttachment(patient, 11, "Анализ крови");
    expect(apiRequest).toHaveBeenCalledWith("/v2/patients/5/attachments/11/", {
      method: "PATCH",
      body: { name: "Анализ крови" },
    });

    await deleteCardAttachment(client, 12);
    expect(apiRequest).toHaveBeenCalledWith("/v2/clients/7/attachments/12/?organizationId=3", { method: "DELETE" });
  });

  it("routes file URLs through the API base, never /media", () => {
    expect(attachmentSrc("/api/v2/patients/5/attachments/11/file/")).toBe("/api/v2/patients/5/attachments/11/file/");
    expect(attachmentSrc("https://crm.example/api/v2/clients/7/attachments/12/file/?organizationId=3")).toBe(
      "/api/v2/clients/7/attachments/12/file/?organizationId=3",
    );
  });
});
