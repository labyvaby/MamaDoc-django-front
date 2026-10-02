/**
 * Данные «Графика персонала»: посты, смены месяца, сотрудники и авансы.
 * Сначала — настоящий API (/v2/hotel/staff-posts/, /staff-shifts/), пока он
 * отвечает 404 — пример по таблице отеля (staffRosterDemo.ts) с isDemo: true.
 * Тот же приём, что у «Событий» (useCityEvents.ts).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../api/client";
import {
  archiveStaffPost,
  createStaffPost,
  listStaffPosts,
  listStaffShifts,
  saveStaffShifts,
  updateStaffPost,
  type HotelStaffPost,
  type HotelStaffPostData,
  type HotelStaffShift,
  type HotelStaffShiftInput,
} from "../api/hotel";
import { getAllDjangoEmployees } from "../api/staff";
import { usePermissions } from "../hooks/usePermissions";
import { fetchAllExpenses } from "./hotelReportData";
import { advancesFromExpenses } from "./hotelStaffPayroll";
import {
  addDemoAdvance,
  archiveDemoPost,
  DEMO_EMPLOYEES,
  demoAdvances,
  listDemoPosts,
  listDemoShifts,
  saveDemoPost,
  saveDemoShifts,
  type RosterEmployee,
} from "./staffRosterDemo";

const isEndpointMissing = (err: unknown) => err instanceof ApiError && (err.status === 404 || err.status === 405);

export interface StaffPostsResult {
  posts: HotelStaffPost[];
  isDemo: boolean;
}

export function useStaffPosts(propertyId: number | undefined) {
  return useQuery<StaffPostsResult>({
    queryKey: ["hotel", "staffPosts", propertyId],
    queryFn: async ({ signal }) => {
      try {
        const posts = await listStaffPosts(propertyId!, signal);
        return { posts: posts.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder), isDemo: false };
      } catch (err) {
        if (!isEndpointMissing(err)) throw err;
        return { posts: await listDemoPosts(), isDemo: true };
      }
    },
    enabled: propertyId != null,
    staleTime: 60_000,
    retry: (count, err) => !isEndpointMissing(err) && count < 1,
  });
}

export function useStaffShifts(propertyId: number | undefined, from: string, to: string, isDemo: boolean | undefined) {
  return useQuery<HotelStaffShift[]>({
    queryKey: ["hotel", "staffShifts", propertyId, from, to, isDemo],
    queryFn: ({ signal }) => (isDemo ? listDemoShifts(from, to) : listStaffShifts({ propertyId: propertyId!, from, to }, signal)),
    enabled: propertyId != null && isDemo != null,
    placeholderData: undefined,
  });
}

export function useSaveShifts(propertyId: number | undefined, isDemo: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shifts: HotelStaffShiftInput[]) => {
      if (isDemo) return saveDemoShifts(shifts);
      await saveStaffShifts({ propertyId: propertyId!, shifts, allowOverlap: true });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["hotel", "staffShifts"] }),
  });
}

export function useSaveStaffPost(propertyId: number | undefined, isDemo: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data, archive }: { id: number | null; data?: HotelStaffPostData; archive?: boolean }) => {
      if (archive && id != null) return isDemo ? archiveDemoPost(id) : archiveStaffPost(id);
      if (isDemo) return saveDemoPost(id, data ?? {});
      if (id == null) {
        return createStaffPost({ ...(data ?? {}), propertyId: propertyId!, name: data?.name ?? "", role: data?.role ?? "other" });
      }
      return updateStaffPost(id, data ?? {});
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["hotel", "staffPosts"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "staffShifts"] });
    },
  });
}

/** Кого можно ставить в смену: в примере — люди из таблицы отеля, иначе — сотрудники организации. */
export function useRosterEmployees(isDemo: boolean | undefined) {
  return useQuery<RosterEmployee[]>({
    queryKey: ["hotel", "rosterEmployees", isDemo],
    queryFn: async ({ signal }) =>
      isDemo ? DEMO_EMPLOYEES : (await getAllDjangoEmployees({ status: "active" }, signal)).map((e) => ({ id: e.id, fullName: e.fullName })),
    enabled: isDemo != null,
    staleTime: 5 * 60_000,
  });
}

/** Авансы месяца: из расходов финансов (категория «Аванс»), в примере — из таблицы. */
export function useMonthAdvances(isDemo: boolean | undefined, branchId: number | null, from: string, to: string, enabled: boolean) {
  const { activeOrganization } = usePermissions();
  const orgId = activeOrganization?.id ?? null;
  return useQuery<Map<number, number>>({
    queryKey: ["hotel", "staffAdvances", isDemo, orgId, branchId, from, to],
    queryFn: async ({ signal }) =>
      isDemo ? demoAdvances() : advancesFromExpenses((await fetchAllExpenses({ organizationId: orgId!, branchId, dateFrom: from, dateTo: to }, signal)).rows),
    enabled: enabled && isDemo != null && (isDemo || orgId != null),
  });
}

export function useAddDemoAdvance() {
  const queryClient = useQueryClient();
  return (employeeId: number, amount: number) => {
    addDemoAdvance(employeeId, amount);
    void queryClient.invalidateQueries({ queryKey: ["hotel", "staffAdvances"] });
  };
}
