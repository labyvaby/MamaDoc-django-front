/**
 * Состояние проверки номера перед выездом для карточки брони (см.
 * roomInspection.ts): активная задача проверки этой брони, её результат и
 * действия — отправить на проверку, отменить, закрыть после выселения.
 */
import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createHousekeepingTask,
  listHousekeepingTasks,
  updateHousekeepingTask,
  type HotelReservation,
} from "../api/hotel";
import { useCan } from "../hooks/useCan";
import { buildInspectionNote, inspectionState, isInspectionFor, parseInspectionResult } from "./roomInspection";

export function useRoomInspection(reservation: HotelReservation | null | undefined, roomId: number | null | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const canView = useCan(["hotel.housekeeping.view", "hotel.manage"]);
  const canManage = useCan(["hotel.housekeeping.manage", "hotel.manage"]);
  const propertyId = reservation?.propertyId ?? null;
  const active = enabled && canView && propertyId != null && roomId != null;

  const tasksQuery = useQuery({
    queryKey: ["hotel", "housekeepingTasks", propertyId, "inspections"],
    // Без status бэкенд отдаёт только открытые и в работе — это и нужно.
    queryFn: ({ signal }) => listHousekeepingTasks({ propertyId: propertyId! }, signal),
    enabled: active,
    select: (tasks) => tasks.filter((t) => t.kind === "inspection"),
    staleTime: 15_000,
    // Пока карточка открыта — подтягиваем ответ горничной сами, без перезагрузки.
    refetchInterval: 20_000,
  });
  const task = reservation && active ? tasksQuery.data?.find((t) => t.roomId === roomId && isInspectionFor(t, reservation.number)) : undefined;
  const state = inspectionState(task);
  const result = task ? parseInspectionResult(task.note) : null;
  const [busy, setBusy] = React.useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["hotel", "housekeepingTasks"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "dashboard"] });
  };

  const request = async (assignedToId?: number | null) => {
    if (!reservation || roomId == null) return;
    const item = reservation.items.find((i) => i.roomId === roomId);
    const guest = reservation.customerName || item?.guests[0]?.fullName || "";
    setBusy(true);
    try {
      await createHousekeepingTask({
        propertyId: reservation.propertyId,
        roomId,
        kind: "inspection",
        assignedToId: assignedToId ?? undefined,
        dueAt: new Date().toISOString(),
        note: buildInspectionNote(reservation.number, guest),
      });
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await updateHousekeepingTask(task.id, { status: "cancelled" });
      refresh();
    } finally {
      setBusy(false);
    }
  };

  /** После выселения: задача сделала своё — закрываем, номер уходит в «грязный». */
  const closeAfterCheckOut = async () => {
    if (!task) return;
    try {
      await updateHousekeepingTask(task.id, { status: "done", roomState: "dirty" });
      refresh();
    } catch {
      // не мешаем выселению — горничная закроет задачу сама
    }
  };

  return { visible: active, canManage, task, state, result, busy, loading: tasksQuery.isPending && active, request, cancel, closeAfterCheckOut };
}

export type RoomInspection = ReturnType<typeof useRoomInspection>;
