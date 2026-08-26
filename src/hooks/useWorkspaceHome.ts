import { PAGE_PERMISSIONS } from "../config/accessPermissions";
import { useCanChecker } from "./useCan";

export type WorkspaceHome = { loading: boolean; workspacePath: string | null };

type CanCheck = (permission: string | string[]) => boolean;

/**
 * Куда вести пользователя «на главную» с учётом его прав.
 *
 * Рабочие пространства приёмов гейтятся отдельными page-правами
 * (`appointments.registry.view` / `doctor_room` / `nurse_room`), поэтому единого
 * адреса главной страницы нет: у регистратора это Регистратура, у врача —
 * Кабинет врача, у медсестры — Процедурный. Хардкод `/appointments` после входа
 * заканчивался для врача экраном «Нет доступа».
 *
 * `workspacePath: null` — ни одного рабочего пространства нет: вести на «Сводку»
 * (`/dashboard`, без гейта) или не показывать ссылку вовсе.
 */
export function resolveWorkspaceHome(can: CanCheck, loading: boolean): WorkspaceHome {
  if (loading) {
    return { loading, workspacePath: null };
  }
  if (can(PAGE_PERMISSIONS.appointmentsRegistry)) {
    return { loading, workspacePath: "/appointments" };
  }
  if (can(PAGE_PERMISSIONS.doctorRoom)) {
    return { loading, workspacePath: "/doctor" };
  }
  if (can(PAGE_PERMISSIONS.nurseRoom)) {
    return { loading, workspacePath: "/nurse" };
  }
  return { loading, workspacePath: null };
}

export function useWorkspaceHome(): WorkspaceHome {
  const { can, loading } = useCanChecker();
  return resolveWorkspaceHome(can, loading);
}
