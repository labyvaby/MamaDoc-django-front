/**
 * DjangoConclusionSlotsPanel
 *
 * Renders the conclusion-slots list for a Django appointment.
 * Fetches GET /api/appointments/<appointmentId>/conclusion-slots/ and shows
 * a compact list with state badges and action buttons.
 *
 * Rules:
 * - Only slots with requiresConclusion=true are returned by backend (no nurses/procedure lines)
 * - canEdit / canPrint come from backend — not computed locally
 * - canCreate permission check guards visibility of the entire panel
 */

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import {
  getConclusionSlots,
  type ConclusionSlot,
  type ConclusionState,
  type MedicalConclusion,
} from "../../api/medical";
import { useCan } from "../../hooks/useCan";
import {
  djangoQueryKeys,
  DJANGO_DETAIL_STALE_TIME_MS,
} from "../../api/queryKeys";
import DjangoConclusionDrawer from "./DjangoConclusionDrawer";
import { useT } from "../../i18n/VerticalProvider";
import { tt } from "../../i18n/t";
import { agree } from "../../i18n/formatters";

// ── state display ──────────────────────────────────────────────────────────────

/** Подпись состояния заключения — из словаря. */
const stateLabel = (state: ConclusionState): string =>
  tt(
    `appointments:conclusionSlots.state.${
      state === "not_created" ? "none" : state === "not_required" ? "notRequired" : state
    }`,
    { defaultValue: String(state) },
  );

const STATE_COLOR: Record<
  ConclusionState,
  "default" | "info" | "success" | "warning"
> = {
  not_created: "default",
  draft: "warning",
  completed: "success",
  not_required: "default",
};

// ── props ──────────────────────────────────────────────────────────────────────

type DjangoConclusionSlotsPanelProps = {
  appointmentId: number;
  /** Филиал приёма — по нему подбирается и режется список бланков. */
  branchId?: number | null;
  /** Закрыть колонку заключения (крестик в шапке). */
  onClose?: () => void;
};

// ── component ──────────────────────────────────────────────────────────────────

const DjangoConclusionSlotsPanel: React.FC<DjangoConclusionSlotsPanelProps> = ({
  appointmentId,
  branchId,
  onClose,
}) => {
  const { t } = useT("appointments");
  const canView = useCan([
    "medical.conclusions.view",
    "medical.conclusions.create",
    "medical.conclusions.update",
    "medical.conclusions.manage",
  ]);

  const queryClient = useQueryClient();
  const queryKey = djangoQueryKeys.appointments.conclusionSlots(appointmentId);
  const slotsQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => getConclusionSlots(appointmentId, signal),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
    enabled: canView,
  });
  const slots = slotsQuery.data ?? [];

  // Drawer state
  const [drawerSlot, setDrawerSlot] = React.useState<ConclusionSlot | null>(null);
  // Inline single-slot edit toggle (просмотр ↔ редактирование в колонке).
  const [editingInline, setEditingInline] = React.useState(false);

  // Optimistically update cache then let React Query sync from server
  const handleSaved = React.useCallback(
    (saved: MedicalConclusion) => {
      queryClient.setQueryData<ConclusionSlot[]>(queryKey, (prev = []) =>
        prev.map((slot) =>
          slot.serviceLineId === saved.serviceLineId
            ? { ...slot, state: saved.status === "completed" ? "completed" : "draft", conclusion: saved }
            : slot,
        ),
      );
      // Список слотов мог устареть целиком: правка приёма пересоздаёт строки
      // услуг с новыми id, и заключение тогда сохраняется в строку, которой в
      // кэше нет (перепривязка в DjangoConclusionDrawer). Догоняем сервером.
      void queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, queryKey],
  );

  if (!canView) return null;

  // Одно заключение → показываем его сразу полностью прямо в колонке (как в
  // оригинале, фото 2). Несколько → список с переходом в просмотр.
  const onlySlot = slots.length === 1 ? slots[0] : null;
  const showInlineSingle = onlySlot !== null && onlySlot.conclusion !== null;

  if (showInlineSingle && onlySlot) {
    return (
      <DjangoConclusionDrawer
        open
        inline
        // В режиме редактирования «Закрыть/Отмена» возвращает к просмотру;
        // в просмотре — закрывает всю колонку.
        onClose={() => {
          if (editingInline) setEditingInline(false);
          else onClose?.();
        }}
        conclusion={onlySlot.conclusion}
        serviceLineId={onlySlot.serviceLineId}
        serviceName={onlySlot.service.name}
        serviceId={onlySlot.service.id}
        doctorName={onlySlot.doctor?.fullName ?? "—"}
        appointmentId={appointmentId}
        branchId={branchId}
        doctorId={onlySlot.doctor?.id ?? null}
        // По умолчанию просмотр; «Изменить заключение» включает редактирование.
        canEdit={onlySlot.canEdit && editingInline}
        canPrint={onlySlot.canPrint}
        onStartEdit={onlySlot.canEdit ? () => setEditingInline(true) : undefined}
        onSaved={(saved) => {
          handleSaved(saved);
          setEditingInline(false);
        }}
      />
    );
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Шапка колонки — как в inline-просмотре */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        px={2}
        py={1.5}
        sx={{ flexShrink: 0 }}
      >
        <Typography variant="h6">{t("conclusionSlots.title")}</Typography>
        {onClose && (
          <IconButton size="small" onClick={onClose}>
            <CloseOutlined fontSize="small" />
          </IconButton>
        )}
      </Stack>
      <Divider />
      <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          mb={1}
        >
          <Typography variant="body2" fontWeight={600} color="text.secondary">
            {t("conclusionSlots.sectionTitle")}
          </Typography>
          {slotsQuery.isFetching && <CircularProgress size={14} />}
        </Stack>

        {slotsQuery.error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {slotsQuery.error instanceof Error ? slotsQuery.error.message : t("conclusionSlots.state.error")}
          </Alert>
        )}

        {!slotsQuery.isLoading && slots.length === 0 && !slotsQuery.error && (
          <Typography variant="body2" color="text.disabled">
            {t("conclusionSlots.empty")}
          </Typography>
        )}

        {slots.length > 0 && (
          <Stack divider={<Divider />} spacing={0}>
            {slots.map((slot) => (
              <SlotRow
                key={slot.serviceLineId}
                slot={slot}
                appointmentId={appointmentId}
                onOpen={() => setDrawerSlot(slot)}
              />
            ))}
          </Stack>
        )}
      </Box>

      {/* Conclusion drawer (для нескольких слотов — открытие по клику) */}
      {drawerSlot && (
        <DjangoConclusionDrawer
          open={!!drawerSlot}
          onClose={() => setDrawerSlot(null)}
          conclusion={drawerSlot.conclusion}
          serviceLineId={drawerSlot.serviceLineId}
          serviceName={drawerSlot.service.name}
          serviceId={drawerSlot.service.id}
          doctorName={drawerSlot.doctor?.fullName ?? "—"}
          appointmentId={appointmentId}
          branchId={branchId}
          doctorId={drawerSlot.doctor?.id ?? null}
          canEdit={drawerSlot.canEdit}
          canPrint={drawerSlot.canPrint}
          onSaved={handleSaved}
        />
      )}
    </Box>
  );
};

// ── single slot row ────────────────────────────────────────────────────────────

const SlotRow: React.FC<{
  slot: ConclusionSlot;
  appointmentId: number;
  onOpen: () => void;
}> = ({ slot, appointmentId, onOpen }) => {
  const { t, term } = useT("appointments");
  const hasConclusion = slot.conclusion !== null;
  const showCreate = slot.canEdit && slot.state === "not_created";
  const showEdit = slot.canEdit && slot.state !== "not_created";
  const showView = !slot.canEdit && hasConclusion;
  const showNotCreatedMsg = !slot.canEdit && !hasConclusion;

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      spacing={1}
      py={1}
      sx={{ minWidth: 0 }}
    >
      {/* left: service + doctor */}
      <Stack spacing={0} sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" noWrap fontWeight={500}>
          {slot.service.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {slot.doctor?.fullName ?? "—"}
        </Typography>
        {showNotCreatedMsg && (
          <Typography variant="caption" color="text.disabled">
            {t("conclusionSlots.notCreatedYet", {
              created: agree(term.conclusion.gender, ["создан", "создана", "создано"]),
            })}
          </Typography>
        )}
      </Stack>

      {/* center: state badge */}
      <Chip
        label={stateLabel(slot.state)}
        size="small"
        color={STATE_COLOR[slot.state]}
        variant="outlined"
        sx={{ fontSize: "0.68rem", height: 20, flexShrink: 0 }}
      />

      {/* right: actions */}
      <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
        {showCreate && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddOutlined />}
            onClick={onOpen}
            sx={{ whiteSpace: "nowrap" }}
          >
            {t("conclusionSlots.create")}
          </Button>
        )}
        {showEdit && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditOutlined />}
            onClick={onOpen}
            sx={{ whiteSpace: "nowrap" }}
          >
            {t("conclusionSlots.edit")}
          </Button>
        )}
        {showView && (
          <Button
            size="small"
            variant="text"
            startIcon={<VisibilityOutlined />}
            onClick={onOpen}
            sx={{ whiteSpace: "nowrap" }}
          >
            {t("conclusionSlots.view")}
          </Button>
        )}
        {slot.canPrint && hasConclusion && (
          <>
            <Tooltip title={t("conclusionSlots.printConclusion")}>
              <Button
                size="small"
                variant="text"
                startIcon={<PrintOutlined />}
                onClick={() =>
                  window.open(
                    `/print/conclusion/${appointmentId}?lineId=${slot.serviceLineId}`,
                    "_blank",
                    "noopener",
                  )
                }
                sx={{ whiteSpace: "nowrap" }}
              >
                {t("conclusionSlots.print")}
              </Button>
            </Tooltip>
            <Tooltip title={t("conclusionSlots.printCertificate")}>
              <Button
                size="small"
                variant="text"
                onClick={() =>
                  window.open(
                    `/print/certificate/${appointmentId}?lineId=${slot.serviceLineId}`,
                    "_blank",
                    "noopener",
                  )
                }
                sx={{ whiteSpace: "nowrap" }}
              >
                {t("conclusionSlots.certificate")}
              </Button>
            </Tooltip>
          </>
        )}
      </Stack>
    </Stack>
  );
};

export default DjangoConclusionSlotsPanel;
