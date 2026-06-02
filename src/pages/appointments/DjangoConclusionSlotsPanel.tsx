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
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import PrintOutlined from "@mui/icons-material/PrintOutlined";

import {
  getConclusionSlots,
  type ConclusionSlot,
  type ConclusionState,
  type MedicalConclusion,
} from "../../api/medical";
import { useCan } from "../../hooks/useCan";
import DjangoConclusionDrawer from "./DjangoConclusionDrawer";

// ── state display ──────────────────────────────────────────────────────────────

const STATE_LABEL: Record<ConclusionState, string> = {
  not_created: "Не создано",
  draft: "Черновик",
  completed: "Готово",
  not_required: "Не требуется",
};

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
};

// ── component ──────────────────────────────────────────────────────────────────

const DjangoConclusionSlotsPanel: React.FC<DjangoConclusionSlotsPanelProps> = ({
  appointmentId,
}) => {
  const canView = useCan([
    "medical.conclusions.view",
    "medical.conclusions.create",
    "medical.conclusions.update",
    "medical.conclusions.manage",
  ]);

  const [slots, setSlots] = React.useState<ConclusionSlot[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState(0);

  // Drawer state
  const [drawerSlot, setDrawerSlot] = React.useState<ConclusionSlot | null>(null);

  const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getConclusionSlots(appointmentId)
      .then((data) => {
        if (!cancelled) {
          setSlots(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appointmentId, version]);

  // Update slot in local state after save without full re-fetch
  const handleSaved = React.useCallback(
    (saved: MedicalConclusion) => {
      setSlots((prev) =>
        prev.map((slot) =>
          slot.serviceLineId === saved.serviceLineId
            ? {
                ...slot,
                state: saved.status === "completed" ? "completed" : "draft",
                conclusion: saved,
              }
            : slot,
        ),
      );
      refresh();
    },
    [refresh],
  );

  if (!canView) return null;

  return (
    <>
      <Box>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          mb={1}
        >
          <Typography variant="body2" fontWeight={600} color="text.secondary">
            Врачебные заключения
          </Typography>
          {loading && <CircularProgress size={14} />}
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {!loading && slots.length === 0 && !error && (
          <Typography variant="body2" color="text.disabled">
            Для этого приёма нет врачебных заключений
          </Typography>
        )}

        {slots.length > 0 && (
          <Stack divider={<Divider />} spacing={0}>
            {slots.map((slot) => (
              <SlotRow
                key={slot.serviceLineId}
                slot={slot}
                onOpen={() => setDrawerSlot(slot)}
              />
            ))}
          </Stack>
        )}
      </Box>

      {/* Conclusion drawer */}
      {drawerSlot && (
        <DjangoConclusionDrawer
          open={!!drawerSlot}
          onClose={() => setDrawerSlot(null)}
          conclusion={drawerSlot.conclusion}
          serviceLineId={drawerSlot.serviceLineId}
          serviceName={drawerSlot.service.name}
          doctorName={drawerSlot.doctor?.fullName ?? "—"}
          canEdit={drawerSlot.canEdit}
          canPrint={drawerSlot.canPrint}
          onSaved={handleSaved}
        />
      )}
    </>
  );
};

// ── single slot row ────────────────────────────────────────────────────────────

const SlotRow: React.FC<{
  slot: ConclusionSlot;
  onOpen: () => void;
}> = ({ slot, onOpen }) => {
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
            Заключение ещё не создано
          </Typography>
        )}
      </Stack>

      {/* center: state badge */}
      <Chip
        label={STATE_LABEL[slot.state]}
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
            Создать
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
            Редактировать
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
            Просмотр
          </Button>
        )}
        {slot.canPrint && hasConclusion && (
          <Tooltip title="PDF-печать будет доступна в следующей версии">
            <span>
              <Button
                size="small"
                variant="text"
                startIcon={<PrintOutlined />}
                disabled
                sx={{ whiteSpace: "nowrap" }}
              >
                Печать
              </Button>
            </span>
          </Tooltip>
        )}
      </Stack>
    </Stack>
  );
};

export default DjangoConclusionSlotsPanel;
