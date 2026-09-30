import type {
  BranchMaps,
  BranchReviewLinkPatch,
  MapPlatform,
} from "../../api/reviews";

export const PLATFORMS: MapPlatform[] = ["2gis", "yandex", "google"];

/** Черновик ссылок на отзыв: ключ `${branchId}:${platform}` → url. */
export type LinkDraft = {
  url: string;
  externalId: string;
  apiKey: string;
};

export type LinksDraft = Record<string, LinkDraft>;

export const linkKey = (branchId: number, platform: MapPlatform) =>
  `${branchId}:${platform}`;

export function linksDraft(branches: BranchMaps[]): LinksDraft {
  const draft: LinksDraft = {};
  branches.forEach((b) =>
    PLATFORMS.forEach((p) => {
      const saved = b.reviewLinks.find((l) => l.platform === p);
      draft[linkKey(b.branchId, p)] = {
        url: saved?.url ?? "",
        externalId: saved?.externalId ?? "",
        apiKey: saved?.apiKey ?? "",
      };
    })
  );
  return draft;
}

/** Только изменённые поля; пустая строка удаляет ссылку на отзыв. */
export function changedLinks(
  branches: BranchMaps[],
  draft: LinksDraft
): BranchReviewLinkPatch[] {
  const saved = linksDraft(branches);
  const patch: BranchReviewLinkPatch[] = [];
  branches.forEach((b) =>
    PLATFORMS.forEach((platform) => {
      const key = linkKey(b.branchId, platform);
      const row = draft[key] ?? { url: "", externalId: "", apiKey: "" };
      const savedRow = saved[key] ?? { url: "", externalId: "", apiKey: "" };
      const url = row.url.trim();
      const externalId = row.externalId.trim();
      const apiKey = row.apiKey.trim();
      if (
        url !== savedRow.url ||
        externalId !== savedRow.externalId ||
        apiKey !== savedRow.apiKey
      )
        patch.push({ branchId: b.branchId, platform, url, externalId, apiKey });
    })
  );
  return patch;
}

/** Ссылка должна быть http(s) и без пробелов — так же проверяет бэкенд. */
export const isReviewUrl = (value: string) =>
  /^https?:\/\/\S+$/i.test(value.trim());

/** Ссылка филиала для площадки — её получит пациент, если своей нет. */
export function branchLink(b: BranchMaps, platform: MapPlatform): string {
  return b.branchLinks.find((l) => l.platform === platform)?.url ?? "";
}
