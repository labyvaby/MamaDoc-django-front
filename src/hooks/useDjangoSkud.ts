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
import { isIpInCidr } from "../utility/network";


const IP_QUERY_KEY = ["common", "userIp"] as const;

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

  const [actionLoading, setActionLoading] = React.useState(false);

  // 1. User's public IP (cached forever).
  const { data: userIp, isLoading: userIpLoading } = useQuery({
    queryKey: IP_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      return data.ip as string;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    enabled: enabled && canClock,
  });

  // 2. Allowed office IP from the backend (cached 5 min).
  const { data: officeIpData, isLoading: officeIpLoading } = useQuery({
    queryKey: djangoQueryKeys.attendance.officeIp,
    queryFn: ({ signal }) => getOfficeIp(signal),
    staleTime: 5 * 60 * 1000,
    enabled: enabled && canView,
  });

  const envIp = import.meta.env.VITE_OFFICE_IP as string | undefined;
  // Разрешённые IP: Wi-Fi каждого филиала + общий IP организации (или env).
  // Сотрудник может начать смену из любого филиала клиники.
  const allowedIps = React.useMemo(() => {
    const branchIps = (officeIpData?.branches ?? [])
      .map((b) => b.officeIp)
      .filter(Boolean);
    const orgIp = officeIpData?.officeIp || envIp || "";
    return orgIp ? [...branchIps, orgIp] : branchIps;
  }, [officeIpData, envIp]);
  // Пустая строка = ни одного IP не настроено (проверка отключена).
  const effectiveAllowedIp = allowedIps.join(", ");
  const isIpCorrect =
    allowedIps.length === 0 ||
    (!!userIp && allowedIps.some((allowed) => isIpInCidr(userIp, allowed)));


  // 3. Current active shift.
  const activeQuery = useQuery({
    queryKey: djangoQueryKeys.attendance.active,
    queryFn: ({ signal }) => getActiveShift(signal),
    staleTime: 60 * 1000,
    enabled: enabled && canView,
  });
  const currentShift = activeQuery.data?.shift ?? null;

  // 4. History (only when requested).
  const historyQuery = useQuery({
    queryKey: djangoQueryKeys.attendance.list({
      employeeId: canManage ? filterEmployeeId ?? null : "self",
      from: filterStartDate ?? null,
      to: filterEndDate ?? null,
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
        },
        signal,
      ),
    enabled: enabled && enableHistory && canView,
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
    setActionLoading(true);
    try {
      await apiClockIn();
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
      await apiClockOut();
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
    locationLoading: userIpLoading || officeIpLoading,
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
