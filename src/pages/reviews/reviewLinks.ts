import type {
  BranchMaps,
  BranchReviewLinkPatch,
  MapPlatform,
} from "../../api/reviews";

export const PLATFORMS: MapPlatform[] = ["2gis", "yandex", "google"];

/** Черновик ссылок на отзыв: ключ `${branchId}:${platform}` → url. */
export type LinksDraft = Record<string, string>;

export const linkKey = (branchId: number, platform: MapPlatform) =>
  `${branchId}:${platform}`;

export function linksDraft(branches: BranchMaps[]): LinksDraft {
  const draft: LinksDraft = {};
  branches.forEach((b) =>
    PLATFORMS.forEach((p) => {
      draft[linkKey(b.branchId, p)] =
        b.reviewLinks.find((l) => l.platform === p)?.url ?? "";
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
      const url = (draft[key] ?? "").trim();
      if (url !== saved[key])
        patch.push({ branchId: b.branchId, platform, url });
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
