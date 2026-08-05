/**
 * Локальное хранилище папок базы знаний — ЗАГЛУШКА на время, пока бэк не отдаёт
 * папки (тикет `MamaDoc/backend_ticket_knowledge_folders.md`).
 *
 * У статьи на бэке есть только `categoryId` (раздел) и `seriesId/partNumber`
 * (части одного материала) — оба заняты другим смыслом и остаются в UI, поэтому
 * принадлежность папке хранить негде. Чтобы фичу можно было собрать и показать
 * заказчику целиком, папки и привязки живут в `localStorage`.
 *
 * ⚠ Это НЕ общие данные: папки видит только тот браузер, в котором их создали.
 * Файл удаляется целиком вместе с ветвями `KNOWLEDGE_FOLDERS_FROM_BACKEND` в
 * `api/knowledge.ts`, когда бэк закроет тикет.
 */
import type { KnowledgeFolder } from "./knowledge";

interface LocalFolderState {
  folders: KnowledgeFolder[];
  /** articleId → folderId. Статьи без записи лежат вне папок. */
  assignments: Record<string, number>;
  /** Счётчик id: локальные папки нумеруем от 1, живые придут с бэка своими. */
  seq: number;
}

const EMPTY: LocalFolderState = { folders: [], assignments: {}, seq: 0 };

/**
 * Ключ скоупится организацией: у суперпользователя, переключающего организации,
 * папки не должны перемешиваться. Скоупа по пользователю нет намеренно — папки
 * по смыслу общие, и на общем компьютере регистратуры их логично видеть всем.
 */
const storageKey = (orgId?: number): string =>
  `mamadoc:knowledge-folders:${orgId ?? "self"}`;

const read = (orgId?: number): LocalFolderState => {
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<LocalFolderState>;
    return {
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      assignments:
        parsed.assignments && typeof parsed.assignments === "object" ? parsed.assignments : {},
      seq: typeof parsed.seq === "number" ? parsed.seq : 0,
    };
  } catch {
    // Приватный режим/битый JSON — ведём себя как «папок нет».
    return { ...EMPTY };
  }
};

const write = (state: LocalFolderState, orgId?: number): void => {
  try {
    localStorage.setItem(storageKey(orgId), JSON.stringify(state));
  } catch {
    // Запись недоступна — папки просто не сохранятся между перезагрузками.
  }
};

export const localFolders = (orgId?: number): KnowledgeFolder[] =>
  [...read(orgId).folders].sort((a, b) => a.position - b.position || a.id - b.id);

export const localCreateFolder = (
  payload: { name: string; position?: number; isActive?: boolean },
  orgId?: number,
): KnowledgeFolder => {
  const state = read(orgId);
  const folder: KnowledgeFolder = {
    id: state.seq + 1,
    name: payload.name,
    position: payload.position ?? state.folders.length + 1,
    isActive: payload.isActive ?? true,
  };
  write({ ...state, seq: folder.id, folders: [...state.folders, folder] }, orgId);
  return folder;
};

export const localUpdateFolder = (
  folderId: number,
  payload: Partial<Omit<KnowledgeFolder, "id">>,
  orgId?: number,
): KnowledgeFolder => {
  const state = read(orgId);
  const folder = state.folders.find((f) => f.id === folderId);
  if (!folder) throw new Error("Папка не найдена");
  const updated = { ...folder, ...payload };
  write(
    { ...state, folders: state.folders.map((f) => (f.id === folderId ? updated : f)) },
    orgId,
  );
  return updated;
};

/** Удаление папки статьи не трогает — они возвращаются в корень (как у категорий). */
export const localDeleteFolder = (folderId: number, orgId?: number): void => {
  const state = read(orgId);
  const assignments = Object.fromEntries(
    Object.entries(state.assignments).filter(([, id]) => id !== folderId),
  );
  write({ ...state, folders: state.folders.filter((f) => f.id !== folderId), assignments }, orgId);
};

/** folderId: null — вынуть статью из папки. */
export const localSetArticleFolder = (
  articleId: number,
  folderId: number | null,
  orgId?: number,
): void => {
  const state = read(orgId);
  const assignments = { ...state.assignments };
  if (folderId == null) delete assignments[String(articleId)];
  else assignments[String(articleId)] = folderId;
  write({ ...state, assignments }, orgId);
};

/** Папка статьи по локальным привязкам (null — статья вне папок). */
export const localArticleFolderId = (articleId: number, orgId?: number): number | null =>
  read(orgId).assignments[String(articleId)] ?? null;

/** Все привязки разом — лента проставляет папки одним проходом, без чтения на статью. */
export const localAssignments = (orgId?: number): Map<number, number> =>
  new Map(
    Object.entries(read(orgId).assignments).map(([articleId, folderId]) => [
      Number(articleId),
      folderId,
    ]),
  );

/**
 * Число статей в каждой папке. Считается по всем привязкам, а не по загруженным
 * страницам ленты: счётчик на плитке иначе врал бы («3 статьи» вместо 12) до
 * нажатия «Показать ещё».
 */
export const localFolderCounts = (orgId?: number): Map<number, number> => {
  const counts = new Map<number, number>();
  for (const folderId of Object.values(read(orgId).assignments)) {
    counts.set(folderId, (counts.get(folderId) ?? 0) + 1);
  }
  return counts;
};
