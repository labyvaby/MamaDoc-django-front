import React from "react";
import { useNotification } from "@refinedev/core";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  clockIn as apiClockIn,
  clockOut as apiClockOut,
  getActiveShift,
  getOfficeIp,
  getShifts,
  type WorkShiftRow,
} from "../api/attendance";
import { djangoQueryKeys } from "../api/queryKeys";
import { useCan } from "./useCan";
import { useActiveScope } from "./useActiveScope";
import { usePermissions } from "./usePermissions";
import { isIpInCidr, parseIpList } from "../utility/network";


/**
 * Django-backed СКУД hook — mirrors the surface of useSkudActions so the
 * shifts page and sidebar can drive clock-in/out, history and the office-IP
 * location check against the Django API.
 */
export function useDjangoSkudActions(
  enableHistory = false,
  filterEmployeeId?: number | "me" | null,
  filterStartDate?: string | null,
  filterEndDate?: string | null,
  enabled = true,
) {
  const { open: notify } = useNotification();
  const queryClient = useQueryClient();
  const canView = useCan("attendance.view");
  const canClock = useCan("attendance.clock");
  const canManage = useCan("attendance.manage");
  const scope = useActiveScope();
  const { activeBranch, activeMembership, switchContext } = usePermissions();

  // Филиал смены бэкенд берёт из активного контекста сессии: тело clock-in
  // с branchId он игнорирует (проверено на test 02.09.2026 — прислали филиал 1,
  // смена открылась в активном 19). Поэтому сессия без выбранного филиала даёт
  // смену с branchId: null, а такие часы не входят ни в один филиальный расчёт
  // зарплаты. Единственный филиал проставляем сами, из нескольких — просим
  // выбрать, но никогда не оставляем отметку молча «ничьей».
  const clockBranches = activeMembership?.branches ?? [];
  const isBranchMissing = clockBranches.length > 0 && !activeBranch;

  const [actionLoading, setActionLoading] = React.useState(false);

  // 1. Allowed office IP and the user's public IP from our own backend.
  // No external IP service: it could independently rate-limit clinic users.
  const { data: officeIpData, isLoading: officeIpLoading } = useQuery({
    queryKey: [
      ...djangoQueryKeys.attendance.officeIp,
      scope.organizationId ?? null,
    ],
    queryFn: ({ signal }) =>
      getOfficeIp({ organizationId: scope.organizationId }, signal),
    staleTime: 5 * 60 * 1000,
    enabled: enabled && canView && scope.orgReady,
  });
  const userIp = officeIpData?.currentIp || undefined;

  const envIp = import.meta.env.VITE_OFFICE_IP as string | undefined;
  // Разрешённые IP: Wi-Fi каждого филиала + общий IP организации (или env).
  // Каждое поле может содержать несколько IP/CIDR через запятую или с новой
  // строки — сотрудник может начать смену из любого филиала клиники и с
  // любого из настроенных для него адресов.
  const allowedIps = React.useMemo(() => {
    const branchIps = (officeIpData?.branches ?? []).flatMap((b) =>
      parseIpList(b.officeIp),
    );
    const orgIps = parseIpList(officeIpData?.officeIp || envIp || "");
    return [...branchIps, ...orgIps];
  }, [officeIpData, envIp]);
  // Пустая строка = ни одного IP не настроено (проверка отключена).
  const effectiveAllowedIp = allowedIps.join(", ");
  const isIpCorrect =
    allowedIps.length === 0 ||
    (!!userIp && allowedIps.some((allowed) => isIpInCidr(userIp, allowed)));


  // 2. Current active shift.
  const activeQuery = useQuery({
    queryKey: [
      ...djangoQueryKeys.attendance.active,
      scope.organizationId ?? null,
    ],
    queryFn: ({ signal }) =>
      getActiveShift({ organizationId: scope.organizationId }, signal),
    staleTime: 60 * 1000,
    enabled: enabled && canView && scope.orgReady,
  });
  const currentShift = activeQuery.data?.shift ?? null;

  // 3. History (only when requested).
  const historyQuery = useQuery({
    queryKey: djangoQueryKeys.attendance.list({
      employeeId: canManage ? filterEmployeeId ?? null : "self",
      from: filterStartDate ?? null,
      to: filterEndDate ?? null,
      organizationId: scope.organizationId ?? null,
    }),
    queryFn: ({ signal }) =>
      getShifts(
        {
          employeeId:
            canManage && filterEmployeeId != null
              ? filterEmployeeId
              : undefined,
          dateFrom: filterStartDate ?? undefined,
          dateTo: filterEndDate ?? undefined,
          organizationId: scope.organizationId,
        },
        signal,
      ),
    enabled: enabled && enableHistory && canView && scope.orgReady,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: djangoQueryKeys.attendance.all,
    });
  };

  const handleStartShift = async () => {
    if (!isIpCorrect) {
      notify?.({
        type: "error",
        message: "Неверный IP адрес. Смена может быть начата только из офиса.",
      });
      return;
    }
    if (isBranchMissing) {
      const only = clockBranches.length === 1 ? clockBranches[0] : null;
      if (!only || !activeMembership) {
        notify?.({
          type: "error",
          message:
            "Филиал не выбран — смена не попадёт в расчёт зарплаты филиала. Выберите филиал и повторите.",
        });
        return;
      }
      try {
        await switchContext?.({
          membershipId: activeMembership.id,
          branchId: only.id,
        });
      } catch {
        notify?.({
          type: "error",
          message: "Не удалось выбрать филиал для смены. Повторите попытку.",
        });
        return;
      }
    }
    setActionLoading(true);
    try {
      await apiClockIn({ organizationId: scope.organizationId });
      notify?.({ type: "success", message: "Смена началась" });
      invalidate();
    } catch (e) {
      notify?.({
        type: "error",
        message: e instanceof Error ? e.message : "Ошибка начала смены",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndShift = async () => {
    setActionLoading(true);
    try {
      await apiClockOut({ organizationId: scope.organizationId });
      notify?.({ type: "success", message: "Смена завершена" });
      invalidate();
    } catch (e) {
      notify?.({
        type: "error",
        message: e instanceof Error ? e.message : "Ошибка завершения смены",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const shifts: WorkShiftRow[] = historyQuery.data ?? [];

  return {
    shifts,
    loading: enableHistory ? historyQuery.isLoading : activeQuery.isLoading,
    isFetching: historyQuery.isFetching,
    canView,
    canClock,
    canManage,
    actionLoading,
    statusLoading:
      activeQuery.isLoading || (enableHistory && historyQuery.isLoading),
    statusError:
      activeQuery.isError || (enableHistory && historyQuery.isError),
    locationLoading: officeIpLoading,
    /** Филиал в сессии не выбран — смена уйдёт без филиала (см. handleStartShift). */
    isBranchMissing,
    clockBranches,
    effectiveAllowedIp,
    userIp,
    isIpCorrect,
    currentShift,
    fetchShifts: () => {
      void historyQuery.refetch();
    },
    handleStartShift,
    handleEndShift,
  };
}
