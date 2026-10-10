import React from "react";
import { Box, Button, ButtonBase, Drawer, IconButton, MenuItem, Skeleton, TextField, Tooltip, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import PersonAddAltOutlined from "@mui/icons-material/PersonAddAltOutlined";

import {
  OPEN_VACANCY_STATUSES,
  createStaffingPosition,
  createVacancy,
  deleteStaffingPosition,
  deleteVacancy,
  downloadStaffingCsv,
  getStaffing,
  getVacancies,
  personnelKeys,
  updateStaffingPosition,
  updateVacancy,
  type StaffingPosition,
  type StaffingPositionInput,
  type Vacancy,
  type VacancyInput,
  type VacancyStatus,
} from "../../api/personnel";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { StatusPill } from "../construction/shared";
import { cardSx } from "../estate-dashboard/format";
import { ConfirmDialog, EmptyNote, FormDrawer, InfoRow } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError } from "../realty-sales/shared";
import { compactSum, parseNumber, vacancyTone } from "./format";
import { useDepartments, useRefreshPersonnel, useStaffingOptions } from "./hooks";

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

const COLUMNS = "minmax(200px, 1.4fr) 64px 110px 120px 72px 84px minmax(200px, 1.6fr)";

/**
 * Вкладка «Штатное расписание» (`frontend-new-modules.md` §2): должности по
 * отделам — ставки, оклад, ФОТ; «Занято» считает бэк по сотрудникам, у которых
 * в карточке выбрана эта штатная единица. Строка открывает правку позиции.
 */
export function StaffingView({ deptId, canManage, onOpenEmployee }: { deptId: number | null; canManage: boolean; onOpenEmployee: (id: number) => void }) {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const { enqueueSnackbar } = useSnackbar();
  const [editing, setEditing] = React.useState<StaffingPosition | "new" | null>(null);
  const staffing = useQuery({ queryKey: personnelKeys.staffing(scope, deptId), queryFn: ({ signal }) => getStaffing(deptId, scope, signal), enabled: scope.orgReady !== false, staleTime: 30_000 });
  const exportCsv = useMutation({ mutationFn: () => downloadStaffingCsv(scope), onError: (error) => enqueueSnackbar(message(error, t("staffing.exportFailed")), { variant: "error" }) });

  if (staffing.error) return <ScreenError error={staffing.error} onRetry={() => void staffing.refetch()} />;
  const data = staffing.data;
  const totals = data?.totals;

  return (
    <>
      <KpiCards
        items={
          totals
            ? [
                { key: "positions", label: t("staffing.kpi.positions"), value: String(totals.positions), hint: t("staffing.kpi.headcount", { count: totals.headcount }) },
                { key: "filled", label: t("staffing.kpi.filled"), value: String(totals.filled), hint: totals.unassigned > 0 ? t("staffing.kpi.unassigned", { count: totals.unassigned }) : null },
                { key: "vacant", label: t("staffing.kpi.vacant"), value: String(totals.vacant), tone: totals.vacant > 0 ? "warning" : null, hint: totals.over > 0 ? t("staffing.kpi.over", { count: totals.over }) : null },
                { key: "fund", label: t("staffing.kpi.fund"), value: compactSum(totals.fund, t), hint: t("staffing.kpi.fundHint") },
              ]
            : null
        }
      />
      <Box sx={{ ...cardSx, minWidth: 0, overflow: "hidden" }}>
        <CardHeader
          title={t("staffing.title")}
          subtitle={t("staffing.hint")}
          action={
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button size="small" variant="outlined" startIcon={<FileDownloadOutlined />} disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()} sx={{ whiteSpace: "nowrap" }}>
                {t("staffing.export")}
              </Button>
              {canManage && (
                <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setEditing("new")} sx={{ whiteSpace: "nowrap" }}>
                  {t("staffing.add")}
                </Button>
              )}
            </Box>
          }
        />
        {!data ? (
          <Box sx={{ p: 2 }}>
            <Skeleton variant="rounded" height={260} />
          </Box>
        ) : data.departments.every((d) => d.positions.length === 0) ? (
          <EmptyNote text={t("staffing.empty")} />
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Box role="table" sx={{ minWidth: 900 }}>
              <Box role="row" sx={{ px: 2.25, py: 1, display: "grid", gridTemplateColumns: COLUMNS, gap: 1.5, borderTop: 1, borderColor: "divider", fontSize: "0.75rem", color: "text.secondary" }}>
                {(["title", "headcount", "salary", "fund", "filled", "vacant", "employees"] as const).map((key) => (
                  <Box key={key} role="columnheader" sx={{ textAlign: key === "title" || key === "employees" ? "left" : "right" }}>
                    {t(`staffing.table.${key}`)}
                  </Box>
                ))}
              </Box>
              {data.departments
                .filter((d) => d.positions.length > 0)
                .map((d) => (
                  <React.Fragment key={d.deptId ?? "none"}>
                    <Box role="row" sx={(th) => ({ px: 2.25, py: 0.75, display: "grid", gridTemplateColumns: COLUMNS, gap: 1.5, borderTop: 1, borderColor: "divider", bgcolor: th.palette.action.hover, fontSize: "0.8125rem", fontWeight: 700 })}>
                      <Box role="cell">{d.deptName || t("staffing.noDept")}</Box>
                      <Num value={d.headcount} />
                      <Box role="cell" />
                      <Num value={formatKGS(d.fund)} />
                      <Num value={d.filled} />
                      <Num value={d.vacant} tone={d.vacant > 0 ? "warning.main" : undefined} />
                      <Box role="cell" />
                    </Box>
                    {d.positions.map((p) => (
                      <PositionRow key={p.id} position={p} onEdit={canManage ? () => setEditing(p) : undefined} onOpenEmployee={onOpenEmployee} />
                    ))}
                  </React.Fragment>
                ))}
            </Box>
          </Box>
        )}
      </Box>
      {canManage && <StaffingPositionDrawer position={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function Num({ value, tone }: { value: React.ReactNode; tone?: string }) {
  return (
    <Box role="cell" sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: tone }}>
      {value}
    </Box>
  );
}

function PositionRow({ position: p, onEdit, onOpenEmployee }: { position: StaffingPosition; onEdit?: () => void; onOpenEmployee: (id: number) => void }) {
  const { t } = useT("personnel");
  return (
    <Box
      role="row"
      onClick={onEdit}
      sx={{ px: 2.25, py: 1, display: "grid", gridTemplateColumns: COLUMNS, gap: 1.5, alignItems: "baseline", borderTop: 1, borderColor: "divider", fontSize: "0.8125rem", cursor: onEdit ? "pointer" : "default", "&:hover": onEdit ? { bgcolor: "action.hover" } : undefined }}
    >
      <Box role="cell" sx={{ minWidth: 0 }}>
        {onEdit ? (
          // Кнопка — чтобы правка открывалась и с клавиатуры.
          <ButtonBase onClick={(e) => (e.stopPropagation(), onEdit())} sx={{ font: "inherit", fontWeight: 600, textAlign: "left", "&:hover": { textDecoration: "underline" } }}>
            {p.title}
          </ButtonBase>
        ) : (
          <Typography component="span" sx={{ font: "inherit", fontWeight: 600 }}>
            {p.title}
          </Typography>
        )}
        {(p.branchName || p.note) && <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{[p.branchName, p.note].filter(Boolean).join(" · ")}</Typography>}
      </Box>
      <Num value={p.headcount} />
      <Num value={formatKGS(p.salary)} />
      <Num value={formatKGS(p.fund)} />
      <Num value={p.filled} tone={p.over > 0 ? "warning.main" : undefined} />
      <Box role="cell" sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        <Box component="span" sx={{ color: p.vacant > 0 ? "warning.main" : undefined, fontWeight: p.vacant > 0 ? 700 : 400 }}>
          {p.vacant}
        </Box>
        {p.over > 0 && <Typography sx={{ fontSize: "0.7rem", color: "warning.main" }}>{t("staffing.over", { count: p.over })}</Typography>}
        {p.inRecruitment > 0 && <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>{t("staffing.inRecruitment", { count: p.inRecruitment })}</Typography>}
      </Box>
      <Box role="cell" sx={{ minWidth: 0, display: "flex", flexWrap: "wrap", columnGap: 1, rowGap: 0.25 }}>
        {p.employees.length === 0 && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>—</Typography>}
        {p.employees.map((e) => (
          <ButtonBase key={e.id} onClick={(ev) => (ev.stopPropagation(), onOpenEmployee(e.id))} sx={{ font: "inherit", color: "primary.main", "&:hover": { textDecoration: "underline" } }}>
            {e.name}
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}

/** «＋ Позиция» / правка / удаление позиции штатного расписания. */
function StaffingPositionDrawer({ position, onClose }: { position: StaffingPosition | "new" | null; onClose: () => void }) {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const refresh = useRefreshPersonnel();
  const { enqueueSnackbar } = useSnackbar();
  const open = position != null;
  const existing = position && position !== "new" ? position : null;
  const departments = useDepartments(open).data ?? [];
  const [title, setTitle] = React.useState("");
  const [deptId, setDeptId] = React.useState<number | "">("");
  const [headcount, setHeadcount] = React.useState("1");
  const [salary, setSalary] = React.useState("");
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(existing?.title ?? "");
    setDeptId(existing?.deptId ?? "");
    setHeadcount(existing ? String(existing.headcount) : "1");
    setSalary(existing ? String(existing.salary) : "");
    setNote(existing?.note ?? "");
    setTouched(false);
    setConfirmDelete(false);
    save.reset();
    remove.reset();
  }, [open, existing]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии

  const input = (): StaffingPositionInput => ({ title, deptId: deptId === "" ? null : deptId, headcount: Number(headcount), salary: String(parseNumber(salary) ?? ""), note });
  const changed = (): Partial<StaffingPositionInput> => {
    if (!existing) return {};
    const next = input();
    const patch: Partial<StaffingPositionInput> = {};
    if (next.title.trim() !== existing.title) patch.title = next.title.trim();
    if (next.deptId !== existing.deptId) patch.deptId = next.deptId;
    if (next.headcount !== existing.headcount) patch.headcount = next.headcount;
    if (Number(next.salary) !== existing.salary) patch.salary = next.salary;
    if (next.note.trim() !== existing.note) patch.note = next.note.trim();
    return patch;
  };
  const save = useMutation({
    mutationFn: () => (existing ? updateStaffingPosition(existing.id, changed(), scope) : createStaffingPosition(input(), scope)),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(existing ? t("staffing.saved") : t("staffing.created"), { variant: "success" });
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteStaffingPosition((existing as StaffingPosition).id, scope),
    onSuccess: () => {
      setConfirmDelete(false);
      refresh();
      enqueueSnackbar(t("staffing.deleted"), { variant: "success" });
      onClose();
    },
  });

  const count = Number(headcount);
  const salaryValue = parseNumber(salary);
  const invalid = { title: !title.trim(), headcount: !Number.isInteger(count) || count < 0, salary: salaryValue == null || salaryValue < 0 };
  const hasErrors = Object.values(invalid).some(Boolean);

  return (
    <>
      <FormDrawer
        open={open}
        title={existing ? t("staffing.form.editTitle", { title: existing.title }) : t("staffing.form.newTitle")}
        submitLabel={existing ? t("common.save") : t("staffing.form.create")}
        busy={save.isPending}
        error={save.error}
        onClose={onClose}
        onSubmit={() => {
          setTouched(true);
          if (hasErrors) return;
          if (existing && Object.keys(changed()).length === 0) return onClose();
          save.mutate();
        }}
      >
        <TextField size="small" label={t("staffing.form.title")} value={title} onChange={(e) => setTitle(e.target.value)} error={touched && invalid.title} helperText={touched && invalid.title ? t("common.required") : undefined} />
        <TextField select size="small" label={t("staffing.form.dept")} value={deptId} onChange={(e) => setDeptId(e.target.value === "" ? "" : Number(e.target.value))} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
          <MenuItem value="">—</MenuItem>
          {departments.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {d.name}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
          <TextField size="small" label={t("staffing.form.headcount")} value={headcount} inputMode="numeric" onChange={(e) => setHeadcount(e.target.value)} error={touched && invalid.headcount} helperText={touched && invalid.headcount ? t("common.number") : undefined} />
          <TextField size="small" label={t("staffing.form.salary")} value={salary} inputMode="decimal" onChange={(e) => setSalary(e.target.value)} error={touched && invalid.salary} helperText={touched && invalid.salary ? t("common.number") : undefined} />
        </Box>
        {!invalid.headcount && !invalid.salary && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("staffing.form.fund", { amount: formatKGS(count * (salaryValue ?? 0)) })}</Typography>}
        <TextField size="small" label={t("staffing.form.note")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
        {existing && (
          <>
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("staffing.form.filledHint", { filled: existing.filled, headcount: existing.headcount })}</Typography>
            <Box>
              {/* Занятую позицию или позицию с открытой вакансией бэк не удаляет: 409 POSITION_HAS_EMPLOYEES / POSITION_HAS_VACANCIES. */}
              <Button color="error" size="small" startIcon={<DeleteOutlineOutlined />} onClick={() => setConfirmDelete(true)} disabled={save.isPending || existing.filled > 0 || existing.inRecruitment > 0}>
                {t("staffing.form.delete")}
              </Button>
              {existing.filled > 0 ? (
                <Typography sx={{ mt: 0.5, fontSize: "0.75rem", color: "text.secondary" }}>{t("staffing.form.deleteBlocked", { count: existing.filled })}</Typography>
              ) : existing.inRecruitment > 0 ? (
                <Typography sx={{ mt: 0.5, fontSize: "0.75rem", color: "text.secondary" }}>{t("staffing.form.deleteBlockedVacancy")}</Typography>
              ) : null}
            </Box>
          </>
        )}
      </FormDrawer>
      <ConfirmDialog
        open={confirmDelete}
        title={t("staffing.deleteConfirm.title")}
        text={t("staffing.deleteConfirm.text")}
        confirmLabel={t("staffing.deleteConfirm.confirm")}
        danger
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

/** Правая панель «Вакансии · N открытых»: этап подбора пилюлей, клик — карточка. */
export function VacanciesPanel({ canManage, onOpen, onCreate }: { canManage: boolean; onOpen: (id: number) => void; onCreate: () => void }) {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const vacancies = useQuery({ queryKey: personnelKeys.vacancies(scope, "open"), queryFn: ({ signal }) => getVacancies("open", scope, signal), enabled: scope.orgReady !== false, staleTime: 30_000, retry: false });
  const staffing = useQuery({ queryKey: personnelKeys.staffing(scope, null), queryFn: ({ signal }) => getStaffing(null, scope, signal), enabled: canManage && scope.orgReady !== false, staleTime: 60_000, retry: false });
  // Все ставки заняты или в подборе — бэк не откроет вакансию (400 по openings), «+» гасим заранее.
  const noFree = staffing.data?.totals.free === 0;
  // Панель вспомогательная: без ручки (старый бэк) или без права — не показываем.
  if (vacancies.error) return null;
  const rows = vacancies.data;
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader
        title={rows ? t("vacancies.title", { count: rows.length }) : t("vacancies.titleShort")}
        action={
          canManage && (
            <Tooltip title={noFree ? t("vacancies.form.noFreeHint") : t("vacancies.add")}>
              <span>
                <IconButton size="small" aria-label={t("vacancies.add")} onClick={onCreate} disabled={noFree}>
                  <AddOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )
        }
      />
      <Box sx={{ px: 2.25, pb: 1.5 }}>
        {!rows ? (
          <Skeleton variant="rounded" height={96} />
        ) : rows.length === 0 ? (
          <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("vacancies.empty")}</Typography>
        ) : (
          rows.map((v) => (
            <ButtonBase key={v.id} onClick={() => onOpen(v.id)} sx={{ width: "100%", py: 0.9, display: "flex", alignItems: "center", gap: 1, textAlign: "left", borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                  {v.title}
                </Typography>
                <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                  {[v.deptName, v.countLabel].filter(Boolean).join(" · ")}
                </Typography>
              </Box>
              <StatusPill label={statusLabel(v, t)} tone={vacancyTone(v.tone)} />
            </ButtonBase>
          ))
        )}
      </Box>
    </Box>
  );
}

type T = (key: string, options?: Record<string, unknown>) => string;

const statusLabel = (v: Pick<Vacancy, "status" | "statusLabel">, t: T) => t(`vacancies.status.${v.status}`, { defaultValue: v.statusLabel || v.status });

/**
 * Карточка вакансии (`?vacancy=`): этап подбора, кандидаты, «Принять по
 * вакансии» (обычный приём — договор и приказ в ЭДО) и закрытие.
 */
export function VacancyDrawer({ id, canManage, onClose, onHire }: { id: number | null; canManage: boolean; onClose: () => void; onHire: (vacancy: Vacancy) => void }) {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const refresh = useRefreshPersonnel();
  const { enqueueSnackbar } = useSnackbar();
  const [editing, setEditing] = React.useState(false);
  const [closing, setClosing] = React.useState<"closed" | "cancelled" | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  // Отдельной деталки в гайде нет — берём из списка (все вакансии, с закрытыми).
  const all = useQuery({ queryKey: personnelKeys.vacancies(scope, null), queryFn: ({ signal }) => getVacancies(null, scope, signal), enabled: id != null && scope.orgReady !== false, staleTime: 15_000 });
  const vacancy = all.data?.find((v) => v.id === id) ?? null;

  const setStatus = useMutation({
    mutationFn: (status: VacancyStatus) => updateVacancy(id as number, { status }, scope),
    onSuccess: () => {
      refresh();
      setClosing(null);
      enqueueSnackbar(t("vacancies.saved"), { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" }),
  });

  // Удаляется только вакансия, по которой никого не приняли; иначе 409 VACANCY_HAS_HIRES — закрыть или отменить.
  const remove = useMutation({
    mutationFn: () => deleteVacancy(id as number, scope),
    onSuccess: () => {
      setConfirmDelete(false);
      refresh();
      enqueueSnackbar(t("vacancies.deleted"), { variant: "success" });
      onClose();
    },
  });

  React.useEffect(() => {
    if (id == null) {
      setEditing(false);
      setClosing(null);
      setConfirmDelete(false);
      remove.reset();
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс при закрытии карточки

  return (
    <>
      <Drawer anchor="right" open={id != null} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 440 }, maxWidth: "100vw" } }}>
        <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", gap: 1, borderBottom: 1, borderColor: "divider" }}>
          <Typography component="h2" sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "1.1rem" }}>
            {vacancy?.title ?? t("vacancies.titleShort")}
          </Typography>
          <IconButton aria-label={t("common.close")} onClick={onClose}>
            <CloseOutlined />
          </IconButton>
        </Box>
        <Box sx={{ p: 2.5, display: "grid", gap: 2 }}>
          {all.error ? (
            <ScreenError error={all.error} onRetry={() => void all.refetch()} />
          ) : !vacancy ? (
            all.isLoading ? <Skeleton variant="rounded" height={220} /> : <EmptyNote text={t("vacancies.notFound")} />
          ) : (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <StatusPill label={statusLabel(vacancy, t)} tone={vacancyTone(vacancy.tone)} />
                {vacancy.countLabel && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{vacancy.countLabel}</Typography>}
              </Box>
              <Box>
                <InfoRow label={t("vacancies.fields.dept")} value={vacancy.deptName || "—"} />
                {vacancy.branchName && <InfoRow label={t("vacancies.fields.branch")} value={vacancy.branchName} />}
                <InfoRow label={t("vacancies.fields.openings")} value={t("vacancies.openingsValue", { hired: vacancy.hired, openings: vacancy.openings })} />
                <InfoRow label={t("vacancies.fields.salary")} value={vacancy.salary != null ? formatKGS(vacancy.salary) : "—"} />
                <InfoRow label={t("vacancies.fields.candidates")} value={vacancy.candidates} />
                <InfoRow label={t("vacancies.fields.responses")} value={vacancy.responses} />
                <InfoRow label={t("vacancies.fields.openedAt")} value={vacancy.openedAt ? dayjs(vacancy.openedAt).format("DD.MM.YYYY") : "—"} />
                {vacancy.closedAt && <InfoRow label={t("vacancies.fields.closedAt")} value={dayjs(vacancy.closedAt).format("DD.MM.YYYY")} />}
              </Box>
              {vacancy.note && <Typography sx={{ fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>{vacancy.note}</Typography>}
              {canManage && vacancy.isOpen && (
                <>
                  <TextField
                    select
                    size="small"
                    label={t("vacancies.fields.stage")}
                    value={OPEN_VACANCY_STATUSES.includes(vacancy.status as VacancyStatus) ? vacancy.status : ""}
                    disabled={setStatus.isPending}
                    onChange={(e) => e.target.value !== vacancy.status && setStatus.mutate(e.target.value as VacancyStatus)}
                  >
                    {OPEN_VACANCY_STATUSES.map((s) => (
                      <MenuItem key={s} value={s}>
                        {t(`vacancies.status.${s}`)}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    <Button variant="contained" startIcon={<PersonAddAltOutlined />} onClick={() => onHire(vacancy)}>
                      {t("vacancies.hire")}
                    </Button>
                    <Button variant="outlined" onClick={() => setEditing(true)}>
                      {t("vacancies.edit")}
                    </Button>
                    <Button color="inherit" onClick={() => setClosing("closed")}>
                      {t("vacancies.close")}
                    </Button>
                    <Button color="error" onClick={() => setClosing("cancelled")}>
                      {t("vacancies.cancel")}
                    </Button>
                  </Box>
                </>
              )}
              {canManage && !vacancy.isOpen && (
                <Box>
                  <Button variant="outlined" disabled={setStatus.isPending} onClick={() => setStatus.mutate("new")}>
                    {t("vacancies.reopen")}
                  </Button>
                </Box>
              )}
              {canManage && vacancy.hired === 0 && (
                <Box sx={{ pt: 1, borderTop: 1, borderColor: "divider" }}>
                  <Button color="error" size="small" startIcon={<DeleteOutlineOutlined />} disabled={setStatus.isPending} onClick={() => setConfirmDelete(true)}>
                    {t("vacancies.delete")}
                  </Button>
                </Box>
              )}
            </>
          )}
        </Box>
      </Drawer>
      {canManage && <VacancyFormDrawer open={editing} vacancy={vacancy} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={closing != null}
        title={t(closing === "cancelled" ? "vacancies.cancelConfirm.title" : "vacancies.closeConfirm.title")}
        text={t(closing === "cancelled" ? "vacancies.cancelConfirm.text" : "vacancies.closeConfirm.text")}
        confirmLabel={t(closing === "cancelled" ? "vacancies.cancel" : "vacancies.close")}
        danger={closing === "cancelled"}
        busy={setStatus.isPending}
        error={null}
        onConfirm={() => closing && setStatus.mutate(closing)}
        onClose={() => setClosing(null)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t("vacancies.deleteConfirm.title")}
        text={t("vacancies.deleteConfirm.text")}
        confirmLabel={t("vacancies.delete")}
        danger
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

/** «＋ Вакансия» и правка: штатная единица подставляет должность и оклад. */
export function VacancyFormDrawer({ open, vacancy, onClose, onCreated }: { open: boolean; vacancy: Vacancy | null; onClose: () => void; onCreated?: (id: number) => void }) {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const refresh = useRefreshPersonnel();
  const { enqueueSnackbar } = useSnackbar();
  const positions = useStaffingOptions(open && vacancy == null);
  const [positionId, setPositionId] = React.useState<number | "">("");
  const [title, setTitle] = React.useState("");
  const [openings, setOpenings] = React.useState("1");
  const [salary, setSalary] = React.useState("");
  const [candidates, setCandidates] = React.useState("0");
  const [responses, setResponses] = React.useState("0");
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPositionId(vacancy?.positionId ?? "");
    setTitle(vacancy?.title ?? "");
    setOpenings(vacancy ? String(vacancy.openings) : "1");
    setSalary(vacancy?.salary != null ? String(vacancy.salary) : "");
    setCandidates(vacancy ? String(vacancy.candidates) : "0");
    setResponses(vacancy ? String(vacancy.responses) : "0");
    setNote(vacancy?.note ?? "");
    setTouched(false);
    save.reset();
  }, [open, vacancy]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии

  const pickPosition = (value: number | "") => {
    setPositionId(value);
    const p = positions.find((x) => x.id === value);
    if (!p) return;
    setTitle(p.title);
    setSalary(String(p.salary));
    // Сколько людей искать — по умолчанию все ставки, которые ещё не в подборе.
    if (p.free > 0) setOpenings(String(p.free));
  };
  const picked = positions.find((x) => x.id === positionId);
  const noFree = positions.length > 0 && positions.every((p) => p.free === 0);

  const ints = { openings: Number(openings), candidates: Number(candidates), responses: Number(responses) };
  const badInt = (value: number, min: number) => !Number.isInteger(value) || value < min;
  const salaryValue = parseNumber(salary);
  // Вакансия всегда на штатную единицу: без `positionId` бэк отвечает 400 (test2, 08.10).
  // Мест не больше свободных ставок позиции за вычетом уже открытых вакансий — иначе 400.
  const tooMany = vacancy == null && picked != null && ints.openings > picked.free;
  const invalid = { position: vacancy == null && positionId === "", title: !title.trim(), openings: badInt(ints.openings, 1) || tooMany, candidates: badInt(ints.candidates, 0), responses: badInt(ints.responses, 0), salary: salary.trim() !== "" && (salaryValue == null || salaryValue < 0) };
  const hasErrors = Object.values(invalid).some(Boolean);
  const input = (): VacancyInput => ({ positionId: positionId === "" ? null : positionId, title, openings: ints.openings, salary: salaryValue != null ? String(salaryValue) : "", candidates: ints.candidates, responses: ints.responses, note });
  const changed = () => {
    if (!vacancy) return {};
    const next = input();
    const patch: Partial<Omit<VacancyInput, "positionId">> = {};
    if (next.title.trim() !== vacancy.title) patch.title = next.title.trim();
    if (next.openings !== vacancy.openings) patch.openings = next.openings;
    if (next.candidates !== vacancy.candidates) patch.candidates = next.candidates;
    if (next.responses !== vacancy.responses) patch.responses = next.responses;
    if (next.salary && Number(next.salary) !== vacancy.salary) patch.salary = next.salary;
    if (next.note.trim() !== vacancy.note) patch.note = next.note.trim();
    return patch;
  };
  const save = useMutation({
    mutationFn: () => (vacancy ? updateVacancy(vacancy.id, changed(), scope) : createVacancy(input(), scope)),
    onSuccess: (saved) => {
      refresh();
      enqueueSnackbar(vacancy ? t("vacancies.saved") : t("vacancies.created"), { variant: "success" });
      onClose();
      if (!vacancy) onCreated?.(saved.id);
    },
  });
  const numberHelp = (bad: boolean) => (touched && bad ? t("common.number") : undefined);

  return (
    <FormDrawer
      open={open}
      title={vacancy ? t("vacancies.form.editTitle", { title: vacancy.title }) : t("vacancies.form.newTitle")}
      submitLabel={vacancy ? t("common.save") : t("vacancies.form.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (hasErrors) return;
        if (vacancy && Object.keys(changed()).length === 0) return onClose();
        save.mutate();
      }}
    >
      {!vacancy && (
        <TextField
          select
          size="small"
          label={t("vacancies.form.position")}
          value={positionId}
          onChange={(e) => pickPosition(e.target.value === "" ? "" : Number(e.target.value))}
          error={touched && invalid.position}
          helperText={noFree ? t("vacancies.form.noFreeHint") : touched && invalid.position ? t("common.required") : t("vacancies.form.positionHint")}
        >
          {positions.map((p) => (
            <MenuItem key={p.id} value={p.id} disabled={p.free === 0}>
              {[p.deptName, p.title].filter(Boolean).join(" · ")}
              {` — ${p.free > 0 ? t("vacancies.form.vacant", { count: p.free }) : t("vacancies.form.noFree")}`}
            </MenuItem>
          ))}
        </TextField>
      )}
      <TextField size="small" label={t("vacancies.form.title")} value={title} onChange={(e) => setTitle(e.target.value)} error={touched && invalid.title} helperText={touched && invalid.title ? t("common.required") : undefined} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        <TextField size="small" label={t("vacancies.form.openings")} value={openings} inputMode="numeric" onChange={(e) => setOpenings(e.target.value)} error={touched && invalid.openings} helperText={touched && tooMany && picked ? t("vacancies.form.tooMany", { count: picked.free }) : numberHelp(invalid.openings)} />
        <TextField size="small" label={t("vacancies.form.salary")} value={salary} inputMode="decimal" onChange={(e) => setSalary(e.target.value)} error={touched && invalid.salary} helperText={numberHelp(invalid.salary)} />
        <TextField size="small" label={t("vacancies.form.candidates")} value={candidates} inputMode="numeric" onChange={(e) => setCandidates(e.target.value)} error={touched && invalid.candidates} helperText={numberHelp(invalid.candidates)} />
        <TextField size="small" label={t("vacancies.form.responses")} value={responses} inputMode="numeric" onChange={(e) => setResponses(e.target.value)} error={touched && invalid.responses} helperText={numberHelp(invalid.responses)} />
      </Box>
      <TextField size="small" label={t("vacancies.form.note")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
    </FormDrawer>
  );
}
