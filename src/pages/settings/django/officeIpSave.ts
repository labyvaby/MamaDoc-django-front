import { parseIpList } from "../../../utility/network";

/**
 * Что именно надо отправить на бэк при сохранении IP-адресов СКУД.
 *
 * Вынесено из страницы отдельно: именно здесь жил баг, из-за которого
 * набранный в поле адрес молча терялся (PATCH не уходил вовсе), а render-
 * библиотек в проекте нет — покрыть поведение можно только чистой функцией.
 */

/** Разбивает вставленный/введённый текст на отдельные IP и мержит с текущим списком. */
export function mergeIpText(current: string[], text: string): string[] {
  const parts = parseIpList(text);
  if (parts.length === 0) return current;
  return Array.from(new Set([...current, ...parts]));
}

/** Состояние формы: подтверждённые чипы + ещё не подтверждённый Enter'ом текст. */
export interface OfficeIpFormState {
  ips: string[];
  ipsInput: string;
  /** Ключ — branchId; филиала может не быть в форме, см. `planOfficeIpSave`. */
  branchIps: Record<number, string[]>;
  branchIpsInput: Record<number, string>;
}

/** То, что сейчас лежит на сервере для активной организации. */
export interface OfficeIpServerState {
  officeIp: string;
  branches: { branchId: number; officeIp: string }[];
}

export interface OfficeIpSavePlan {
  /** Общий IP организации; `null` — не менялся, запрос не нужен. */
  orgIp: string | null;
  /** Только изменившиеся филиалы — каждый уходит отдельным PATCH. */
  branches: { branchId: number; officeIp: string }[];
  /** Состояние формы после успешной отправки (чипы без «хвоста» ввода). */
  nextIps: string[];
  nextBranchIps: Record<number, string[]>;
}

/**
 * Считает план сохранения.
 *
 * Правила:
 * - недобранный текст считается частью значения — иначе адрес, введённый без
 *   Enter, не попадал бы в запрос;
 * - отправляются только реально изменившиеся поля;
 * - филиал, которого нет в форме (появился на сервере уже после загрузки),
 *   пропускается: пустое поле не должно затирать чужой настроенный IP.
 *
 * Организация в план не входит — её задаёт вызывающий код (`organizationId`
 * активного скоупа), а состояние формы сбрасывается при её переключении.
 */
export function planOfficeIpSave(
  form: OfficeIpFormState,
  server: OfficeIpServerState,
): OfficeIpSavePlan {
  const nextIps = mergeIpText(form.ips, form.ipsInput);
  const nextOrgIp = nextIps.join(", ");

  const nextBranchIps: Record<number, string[]> = {};
  const branches: { branchId: number; officeIp: string }[] = [];

  for (const branch of server.branches) {
    const current = form.branchIps[branch.branchId];
    if (current === undefined) continue;

    const merged = mergeIpText(
      current,
      form.branchIpsInput[branch.branchId] ?? "",
    );
    nextBranchIps[branch.branchId] = merged;

    const officeIp = merged.join(", ");
    if (officeIp !== (branch.officeIp ?? "")) {
      branches.push({ branchId: branch.branchId, officeIp });
    }
  }

  return {
    orgIp: nextOrgIp === (server.officeIp ?? "") ? null : nextOrgIp,
    branches,
    nextIps,
    nextBranchIps,
  };
}
