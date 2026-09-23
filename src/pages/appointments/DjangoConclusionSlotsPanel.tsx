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
 * - A line may carry several conclusions (documents, since 22.09.2026): the
 *   doctor fills the visit form and the ultrasound protocol for one service,
 *   each on its own blank. DocumentBar under the drawer header switches them.
 */

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import { useNotification } from "@refinedev/core";

import {
  canAddConclusion,
  conclusionCanEdit,
  conclusionCanPrint,
  slotDisplayState,
  deleteConclusion,
  getConclusionSlots,
  slotConclusions,
  type ConclusionSlot,
  type ConclusionState,
  type MedicalConclusion,
} from "../../api/medical";
import { parseConclusionFormData } from "../../api/conclusionFormData";
import { useCan } from "../../hooks/useCan";
import { getErrorCode } from "../../api/client";
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

// ── documents of a line ────────────────────────────────────────────────────────

/** Какой документ строки открыт: id заключения, «новый» или первый (null). */
type DocKey = number | "new" | null;

/**
 * Документ строки для дровера. Черновик первого документа живёт под прежним
 * ключом строки — так не теряются черновики, начатые до появления нескольких
 * документов; у остальных свой различитель (см. draftScope в дровере).
 */
function resolveDoc(
  slot: ConclusionSlot,
  key: DocKey,
): { conclusion: MedicalConclusion | null; createAsNew: boolean; draftScope?: string } {
  if (key === "new") return { conclusion: null, createAsNew: true, draftScope: "new" };
  const docs = slotConclusions(slot);
  const index = key == null ? 0 : Math.max(0, docs.findIndex((c) => c.id === key));
  const conclusion = docs[index] ?? null;
  return {
    conclusion,
    createAsNew: false,
    draftScope: index > 0 && conclusion ? `c${conclusion.id}` : undefined,
  };
}

/** Подпись документа — имя бланка из снапшота, иначе порядковый номер. */
function documentLabel(conclusion: MedicalConclusion, index: number): string {
  const name = parseConclusionFormData(conclusion.formData)?.snapshot?.name?.trim();
  return name || tt("appointments:conclusionSlots.documentN", { n: index + 1 });
}

/**
 * Переключатель документов строки под шапкой заключения. Виден, когда
 * документов больше одного или можно добавить ещё: у строки с одним
 * документом и без права добавлять он был бы лишней полосой.
 */
const DocumentBar: React.FC<{
  slot: ConclusionSlot;
  active: DocKey;
  onSelect: (key: DocKey) => void;
  /** Можно ли сейчас начать новый документ. */
  canAdd: boolean;
  /** Переключение запрещено (идёт правка в колонке). */
  locked?: boolean;
  /** Удалить черновик; нет — крестика на чипах нет. */
  onDelete?: (doc: MedicalConclusion, label: string) => void;
}> = ({ slot, active, onSelect, canAdd, locked = false, onDelete }) => {
  const { t } = useT("appointments");
  const docs = slotConclusions(slot);
  const activeId = active === "new" ? null : active ?? docs[0]?.id ?? null;
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      aria-label={t("conclusionSlots.documents")}
      sx={{ px: 2, py: 1, flexShrink: 0, overflowX: "auto" }}
    >
      {docs.map((doc, index) => {
        const selected = doc.id === activeId;
        const label = documentLabel(doc, index);
        // Удаляется только черновик (завершённый бэк не отдаст: 409), и только
        // тем, кто может править этот документ.
        const deletable =
          onDelete && !locked && doc.status === "draft" && conclusionCanEdit(slot, doc);
        return (
          <Chip
            key={doc.id}
            size="small"
            label={label}
            title={stateLabel(doc.status)}
            color={selected ? "primary" : "default"}
            variant={selected ? "filled" : "outlined"}
            onClick={selected || locked ? undefined : () => onSelect(doc.id)}
            onDelete={deletable ? () => onDelete(doc, label) : undefined}
            deleteIcon={
              <Tooltip title={t("conclusionSlots.deleteDraft")}>
                <DeleteOutlined />
              </Tooltip>
            }
            icon={
              <Box
                component="span"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  bgcolor: doc.status === "completed" ? "success.main" : "warning.main",
                }}
              />
            }
            sx={{ flexShrink: 0, maxWidth: 220, "& .MuiChip-icon": { ml: 1 } }}
          />
        );
      })}
      {active === "new" && (
        <Chip
          size="small"
          label={t("conclusionSlots.newDocument")}
          color="primary"
          sx={{ flexShrink: 0 }}
        />
      )}
      {canAdd && !locked && active !== "new" && (
        <Tooltip title={t("conclusionSlots.addDocumentHint")}>
          <Button
            size="small"
            variant="text"
            startIcon={<AddOutlined />}
            onClick={() => onSelect("new")}
            sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {t("conclusionSlots.addDocument")}
          </Button>
        </Tooltip>
      )}
    </Stack>
  );
};

const showDocumentBar = (slot: ConclusionSlot, active: DocKey) =>
  active === "new" ||
  slotConclusions(slot).length > 1 ||
  (slot.canEdit && canAddConclusion(slot));

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
  const [drawerDoc, setDrawerDoc] = React.useState<DocKey>(null);
  // Inline single-slot edit toggle (просмотр ↔ редактирование в колонке).
  const [editingInline, setEditingInline] = React.useState(false);
  const [inlineDoc, setInlineDoc] = React.useState<DocKey>(null);
  const canDelete = useCan("medical.conclusions.delete");
  const { open: notify } = useNotification();
  const [deleteTarget, setDeleteTarget] = React.useState<{
    doc: MedicalConclusion;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const requestDelete = canDelete
    ? (doc: MedicalConclusion, label: string) => setDeleteTarget({ doc, label })
    : undefined;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { doc } = deleteTarget;
    setDeleting(true);
    try {
      await deleteConclusion(doc.id);
      queryClient.setQueryData<ConclusionSlot[]>(queryKey, (prev = []) =>
        prev.map((slot) => {
          if (slot.serviceLineId !== doc.serviceLineId) return slot;
          const next = slotConclusions(slot).filter((c) => c.id !== doc.id);
          const state: ConclusionState =
            next.length === 0
              ? "not_created"
              : next.some((c) => c.status === "completed")
                ? "completed"
                : "draft";
          return { ...slot, state, conclusion: next[0] ?? null, conclusions: next };
        }),
      );
      // Удалённый документ был открыт — возвращаемся к первому.
      if (inlineDoc === doc.id) {
        setInlineDoc(null);
        setEditingInline(false);
      }
      if (drawerDoc === doc.id) setDrawerDoc(null);
      notify?.({ type: "success", message: t("conclusionSlots.deleted") });
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      notify?.({
        type: "error",
        message:
          getErrorCode(err) === "CONCLUSION_COMPLETED"
            ? t("conclusionSlots.deleteCompleted")
            : err instanceof Error
              ? err.message
              : String(err),
      });
      // Документ мог завершиться в другой вкладке — подтягиваем свежий статус.
      if (getErrorCode(err) === "CONCLUSION_COMPLETED") {
        setDeleteTarget(null);
        void queryClient.invalidateQueries({ queryKey });
      }
    } finally {
      setDeleting(false);
    }
  };

  const deleteDialog = (
    <Dialog
      open={deleteTarget !== null}
      onClose={deleting ? undefined : () => setDeleteTarget(null)}
      fullWidth
      PaperProps={{ sx: { maxWidth: 440 } }}
    >
      <DialogTitle>{t("conclusionSlots.deleteTitle")}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t("conclusionSlots.deleteText", { name: deleteTarget?.label ?? "" })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
          {t("conclusionSlots.deleteCancel")}
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={() => void confirmDelete()}
          disabled={deleting}
          startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlined />}
        >
          {t("conclusionSlots.deleteConfirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
  // Колонка переживает смену приёма — начатый «новый документ» не должен
  // переехать в чужой приём.
  React.useEffect(() => {
    setInlineDoc(null);
  }, [appointmentId]);

  // Optimistically update cache then let React Query sync from server
  const handleSaved = React.useCallback(
    (saved: MedicalConclusion) => {
      queryClient.setQueryData<ConclusionSlot[]>(queryKey, (prev = []) =>
        prev.map((slot) => {
          if (slot.serviceLineId !== saved.serviceLineId) return slot;
          const docs = slotConclusions(slot);
          const known = docs.some((c) => c.id === saved.id);
          const next = known ? docs.map((c) => (c.id === saved.id ? saved : c)) : [...docs, saved];
          // Статус строки до ответа сервера — как считает бэк: строка
          // «завершена», как только завершён любой её документ. Для показа
          // сводное «готовы все» считает slotDisplayState.
          const state: ConclusionState = next.some((c) => c.status === "completed")
            ? "completed"
            : "draft";
          return { ...slot, state, conclusion: next[0], conclusions: next };
        }),
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
    const doc = resolveDoc(onlySlot, inlineDoc);
    const editing = editingInline || inlineDoc === "new";
    // Новый документ правит тот, кому можно создавать в строке.
    const docCanEdit = doc.createAsNew ? onlySlot.canEdit : conclusionCanEdit(onlySlot, doc.conclusion);
    return (
      <>
      <DjangoConclusionDrawer
        open
        inline
        // В режиме редактирования «Закрыть/Отмена» возвращает к просмотру;
        // в просмотре — закрывает всю колонку. Брошенный новый документ —
        // назад к первому (черновик остаётся в браузере).
        onClose={() => {
          if (inlineDoc === "new") setInlineDoc(null);
          if (editing) setEditingInline(false);
          else onClose?.();
        }}
        conclusion={doc.conclusion}
        createAsNew={doc.createAsNew}
        draftScope={doc.draftScope}
        documentBar={
          showDocumentBar(onlySlot, inlineDoc) ? (
            <DocumentBar
              slot={onlySlot}
              active={inlineDoc}
              // Посреди правки в колонке документ не переключаем: сначала
              // сохранить или отменить — иначе кнопки формы относились бы уже
              // к другому документу.
              locked={editing}
              canAdd={onlySlot.canEdit && canAddConclusion(onlySlot)}
              onDelete={requestDelete}
              onSelect={(key) => {
                setInlineDoc(key);
                setEditingInline(key === "new");
              }}
            />
          ) : undefined
        }
        serviceLineId={onlySlot.serviceLineId}
        serviceName={onlySlot.service.name}
        serviceId={onlySlot.service.id}
        doctorName={onlySlot.doctor?.fullName ?? "—"}
        appointmentId={appointmentId}
        branchId={branchId}
        doctorId={onlySlot.doctor?.id ?? null}
        // По умолчанию просмотр; «Изменить заключение» включает редактирование.
        canEdit={docCanEdit && editing}
        canPrint={conclusionCanPrint(onlySlot, doc.conclusion)}
        onStartEdit={docCanEdit ? () => setEditingInline(true) : undefined}
        onSaved={(saved) => {
          handleSaved(saved);
          setEditingInline(false);
          // Новый документ сохранён — дальше это обычный документ строки.
          if (inlineDoc === "new") setInlineDoc(saved.id);
        }}
      />
      {deleteDialog}
      </>
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
                onOpen={() => {
                  setDrawerDoc(null);
                  setDrawerSlot(slot);
                }}
              />
            ))}
          </Stack>
        )}
      </Box>

      {/* Conclusion drawer (для нескольких слотов — открытие по клику) */}
      {drawerSlot && (
        <SlotDrawer
          // Слот из кэша, а не снимок на момент открытия: после сохранения
          // список документов в переключателе должен быть свежим.
          slot={slots.find((s) => s.serviceLineId === drawerSlot.serviceLineId) ?? drawerSlot}
          doc={drawerDoc}
          onSelectDoc={setDrawerDoc}
          appointmentId={appointmentId}
          branchId={branchId}
          onClose={() => setDrawerSlot(null)}
          onSaved={handleSaved}
          onDeleteDoc={requestDelete}
        />
      )}
      {deleteDialog}
    </Box>
  );
};

// ── drawer for a slot of the list ──────────────────────────────────────────────

const SlotDrawer: React.FC<{
  slot: ConclusionSlot;
  doc: DocKey;
  onSelectDoc: (key: DocKey) => void;
  appointmentId: number;
  branchId?: number | null;
  onClose: () => void;
  onSaved: (saved: MedicalConclusion) => void;
  onDeleteDoc?: (doc: MedicalConclusion, label: string) => void;
}> = ({ slot, doc, onSelectDoc, appointmentId, branchId, onClose, onSaved, onDeleteDoc }) => {
  const resolved = resolveDoc(slot, doc);
  return (
    <DjangoConclusionDrawer
      open
      onClose={onClose}
      conclusion={resolved.conclusion}
      createAsNew={resolved.createAsNew}
      draftScope={resolved.draftScope}
      documentBar={
        showDocumentBar(slot, doc) ? (
          <DocumentBar
            slot={slot}
            active={doc}
            // Черновик каждого документа пишется в браузер по своему ключу,
            // поэтому переключаться посреди правки не страшно.
            canAdd={slot.canEdit && canAddConclusion(slot)}
            onDelete={onDeleteDoc}
            onSelect={onSelectDoc}
          />
        ) : undefined
      }
      serviceLineId={slot.serviceLineId}
      serviceName={slot.service.name}
      serviceId={slot.service.id}
      doctorName={slot.doctor?.fullName ?? "—"}
      appointmentId={appointmentId}
      branchId={branchId}
      doctorId={slot.doctor?.id ?? null}
      canEdit={resolved.createAsNew ? slot.canEdit : conclusionCanEdit(slot, resolved.conclusion)}
      canPrint={conclusionCanPrint(slot, resolved.conclusion)}
      onSaved={onSaved}
    />
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
  const docCount = slotConclusions(slot).length;
  const displayState = slotDisplayState(slot);
  // Документов несколько — печать из строки неоднозначна (печатала бы первый):
  // печатают из самого документа.
  const printFromRow = docCount === 1 && conclusionCanPrint(slot, slot.conclusion);
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
        {docCount > 1 && (
          <Typography variant="caption" color="text.secondary">
            {t("conclusionSlots.documentsCount", { count: docCount })}
          </Typography>
        )}
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
        label={stateLabel(displayState)}
        size="small"
        color={STATE_COLOR[displayState]}
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
        {printFromRow && (
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
