import React from "react";
import { Alert, Box, Button, Checkbox, Drawer, FormControlLabel, IconButton, Link, MenuItem, Skeleton, TextField, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";
import CloseOutlined from "@mui/icons-material/CloseOutlined";

import {
  VACATION_TYPES,
  createEmployee,
  fireEmployee,
  getEmployeeCard,
  getEmployeePayslip,
  hireByVacancy,
  personnelKeys,
  raiseEmployee,
  registerAbsence,
  rehireEmployee,
  updateEmployee,
  type AbsenceKind,
  type Employee,
  type EmployeePatch,
  type Vacancy,
  type VacationType,
} from "../../api/personnel";
import { getMotivation, motivationKeys } from "../../api/salaryMotivation";
import { CustomDatePicker } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { HistoryList, SectionTitle, StatusPill } from "../construction/shared";
import { ConfirmDialog, FormDrawer, InfoRow } from "../realty-finance/shared";
import { useProjectOptions } from "../realty-finance/hooks";
import { employeeTone, isoDate, parseNumber } from "./format";
import { useDepartments, useRefreshPersonnel, useStaffingOptions } from "./hooks";

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** Карточка сотрудника (`?employee=`): KPI, реквизиты, события; кадровые действия. */
export function EmployeeDrawer({ id, preview, canManage, onClose }: { id: number | null; preview: Employee | null; canManage: boolean; onClose: () => void }) {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const refresh = useRefreshPersonnel();
  const { enqueueSnackbar } = useSnackbar();
  const canSalary = useCan("salary.view");
  const [dialog, setDialog] = React.useState<"edit" | "raise" | "fire" | AbsenceKind | null>(null);
  const card = useQuery({ queryKey: personnelKeys.card(scope, id ?? 0), queryFn: ({ signal }) => getEmployeeCard(id as number, scope, signal), enabled: id != null && scope.orgReady !== false, staleTime: 15_000 });
  const payslip = useQuery({
    queryKey: personnelKeys.payslip(scope, id ?? 0),
    queryFn: ({ signal }) => getEmployeePayslip(id as number, null, scope, signal),
    enabled: id != null && canSalary && scope.orgReady !== false,
    staleTime: 60_000,
    retry: false,
  });
  // «План продаж» — строка сотрудника в «Планах и мотивации» текущего месяца, если он там есть.
  const motivation = useQuery({ queryKey: motivationKeys.month(scope, null), queryFn: ({ signal }) => getMotivation(null, scope, signal), enabled: id != null && canSalary && scope.orgReady !== false, staleTime: 5 * 60_000, retry: false });
  const rehire = useMutation({
    mutationFn: () => rehireEmployee(id as number, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("staff.card.rehired"), { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" }),
  });
  React.useEffect(() => setDialog(null), [id]);

  const detail = card.data && card.data.employee.id === id ? card.data : null;
  const e = detail?.employee ?? (preview && preview.id === id ? preview : null);
  const plan = motivation.data?.rows.find((r) => r.employeeId === id) ?? null;
  const fired = e?.status === "fired";

  return (
    <Drawer anchor="right" open={id != null} onClose={onClose} PaperProps={{ sx: { width: { xs: "100vw", sm: 540 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}>
      <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "flex-start", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{e ? [e.position, e.deptName].filter(Boolean).join(" · ") : ""}</Typography>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>
            {e?.name ?? ""}
          </Typography>
        </Box>
        {e && <StatusPill label={e.statusLabel || e.status} tone={employeeTone(e.status)} />}
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseOutlined />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2.25, alignContent: "start" }}>
        {!e && card.isLoading && <Skeleton variant="rounded" height={300} />}
        {!e && card.error && <Alert severity="error">{message(card.error, t("staff.card.notFound"))}</Alert>}
        {e && (
          <>
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" } }}>
              {[
                [t("staff.card.salary"), e.salary != null ? formatKGS(e.salary) : "—"],
                [t("staff.card.worked"), detail ? t("staff.card.workedValue", { worked: detail.currentMonth.worked, workdays: detail.currentMonth.workdays }) : "…"],
                [t("staff.card.vacationLeft"), t("common.days", { count: e.vacationLeft })],
                [t("staff.card.lastPay"), payslip.data ? formatKGS(payslip.data.net) : "—"],
              ].map(([label, value]) => (
                <Box key={label} sx={{ px: 1.25, py: 1, border: 1, borderColor: "divider", borderRadius: "10px", minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                    {label}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 700 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box>
              {detail?.headName && <InfoRow label={t("staff.card.head")} value={detail.headName} />}
              <InfoRow label={t("staff.card.dept")} value={e.deptName || "—"} />
              <InfoRow label={t("staff.card.project")} value={e.projectName || "—"} />
              {e.phone && <InfoRow label={t("staff.card.phone")} value={<Link href={`tel:${e.phone}`}>{formatPhoneDisplay(e.phone)}</Link>} />}
              {e.email && <InfoRow label={t("staff.card.email")} value={e.email} />}
              <InfoRow label={t("staff.card.hired")} value={e.hired ? dayjs(e.hired).format("DD.MM.YYYY") : "—"} />
              {e.contractNumber && <InfoRow label={t("staff.card.contract")} value={e.contractNumber} />}
              {e.probationUntil && <InfoRow label={t("staff.card.probationUntil")} value={dayjs(e.probationUntil).format("DD.MM.YYYY")} tone="warning" />}
              {e.birthday && <InfoRow label={t("staff.card.birthday")} value={dayjs(e.birthday).format("DD.MM.YYYY")} />}
              {e.firedAt && <InfoRow label={t("staff.card.firedAt")} value={dayjs(e.firedAt).format("DD.MM.YYYY")} tone="error" />}
              {e.fireReason && <InfoRow label={t("staff.card.fireReason")} value={e.fireReason} />}
            </Box>
            {plan && plan.plan > 0 && (
              <Box>
                <SectionTitle>{t("staff.card.plan")}</SectionTitle>
                <Typography sx={{ fontSize: "0.875rem" }}>{t("staff.card.planValue", { fact: formatKGS(plan.fact), plan: formatKGS(plan.plan), pct: plan.pct.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) })}</Typography>
              </Box>
            )}
            {detail && (
              <>
                <Box>
                  <SectionTitle>{t("staff.card.documents")}</SectionTitle>
                  {detail.documents.length === 0 ? (
                    <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("staff.card.documentsEmpty")}</Typography>
                  ) : (
                    detail.documents.map((d, index) => (
                      <Typography key={d.id ?? `${d.number}-${index}`} sx={{ fontSize: "0.8125rem" }}>
                        {d.url ? (
                          <Link href={d.url} target="_blank" rel="noreferrer">
                            {d.name}
                          </Link>
                        ) : (
                          d.name
                        )}
                        {(d.number || d.date) && (
                          <Box component="span" sx={{ color: "text.secondary" }}>
                            {" · "}
                            {[d.number, d.date ? dayjs(d.date).format("DD.MM.YYYY") : ""].filter(Boolean).join(" · ")}
                          </Box>
                        )}
                      </Typography>
                    ))
                  )}
                </Box>
                <Box>
                  <SectionTitle>{t("common.history")}</SectionTitle>
                  <HistoryList items={detail.events.map((ev) => ({ at: ev.at, by: ev.typeLabel, text: ev.text }))} empty="—" />
                </Box>
              </>
            )}
          </>
        )}
      </Box>
      {e && canManage && (
        <Box sx={{ px: 2.5, py: 1.5, display: "flex", flexWrap: "wrap", gap: 1, borderTop: 1, borderColor: "divider" }}>
          {fired ? (
            <Button variant="contained" onClick={() => rehire.mutate()} disabled={rehire.isPending}>
              {t("staff.card.rehire")}
            </Button>
          ) : (
            <>
              <Button variant="contained" onClick={() => setDialog("edit")}>
                {t("staff.card.edit")}
              </Button>
              <Button variant="outlined" onClick={() => setDialog("raise")}>
                {t("staff.card.raise")}
              </Button>
              <Button onClick={() => setDialog("vacation")}>{t("staff.card.vacation")}</Button>
              <Button onClick={() => setDialog("sick")}>{t("staff.card.sick")}</Button>
              <Button onClick={() => setDialog("trip")}>{t("staff.card.trip")}</Button>
              <Button color="error" onClick={() => setDialog("fire")} sx={{ ml: "auto" }}>
                {t("staff.card.fire")}
              </Button>
            </>
          )}
        </Box>
      )}
      <EmployeeFormDrawer open={dialog === "edit"} employee={e} onClose={() => setDialog(null)} />
      <RaiseDialog employee={dialog === "raise" ? e : null} onClose={() => setDialog(null)} />
      <AbsenceDialog employee={dialog === "vacation" || dialog === "sick" || dialog === "trip" ? e : null} kind={(dialog as AbsenceKind) ?? "vacation"} onClose={() => setDialog(null)} />
      <FireDialog employee={dialog === "fire" ? e : null} onClose={() => setDialog(null)} />
    </Drawer>
  );
}

/** «＋ Сотрудник» (employee = null) и «Изменить». */
/**
 * Приём / правка сотрудника. С `vacancy` — «Принять по вакансии»: тот же приём
 * (договор и приказ в ЭДО) через `/vacancies/<id>/hire/`, должность, отдел,
 * оклад и штатная единица подставлены из вакансии.
 */
export function EmployeeFormDrawer({
  open,
  employee,
  vacancy = null,
  onClose,
  onCreated,
}: {
  open: boolean;
  employee: Employee | null;
  vacancy?: Vacancy | null;
  onClose: () => void;
  onCreated?: (id: number) => void;
}) {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const refresh = useRefreshPersonnel();
  const { enqueueSnackbar } = useSnackbar();
  const departments = useDepartments(open).data ?? [];
  const projects = useProjectOptions(open);
  const positions = useStaffingOptions(open);
  const editing = employee != null;
  const [staffingPositionId, setStaffingPositionId] = React.useState<number | "">("");
  const [name, setName] = React.useState("");
  const [position, setPosition] = React.useState("");
  const [deptId, setDeptId] = React.useState<number | "">("");
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [salary, setSalary] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [birthday, setBirthday] = React.useState<Dayjs | null>(null);
  const [hired, setHired] = React.useState<Dayjs | null>(null);
  const [vacationLeft, setVacationLeft] = React.useState("");
  const [probation, setProbation] = React.useState(true);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(employee?.name ?? "");
    setPosition(employee?.position ?? vacancy?.title ?? "");
    setDeptId(employee?.deptId ?? vacancy?.deptId ?? "");
    setProjectId(employee?.projectId ?? "");
    setSalary(employee?.salary != null ? String(employee.salary) : vacancy?.salary != null ? String(vacancy.salary) : "");
    setStaffingPositionId(employee?.staffingPositionId ?? vacancy?.positionId ?? "");
    setPhone(employee?.phone ?? "");
    setEmail(employee?.email ?? "");
    setBirthday(employee?.birthday ? dayjs(employee.birthday) : null);
    setHired(employee?.hired ? dayjs(employee.hired) : dayjs());
    setVacationLeft(employee ? String(employee.vacationLeft) : "");
    setProbation(true);
    setTouched(false);
    save.reset();
  }, [open, employee, vacancy]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии

  // Штатная единица подставляет должность, отдел и оклад — только в пустые поля
  // при приёме; при правке человек мог договориться об окладе отдельно.
  const pickPosition = (value: number | "") => {
    setStaffingPositionId(value);
    const p = positions.find((x) => x.id === value);
    if (!p || editing) return;
    if (!position.trim()) setPosition(p.title);
    if (deptId === "" && p.deptId != null) setDeptId(p.deptId);
    if (!salary.trim()) setSalary(String(p.salary));
  };

  // Правка: шлём только изменённые поля (PATCH).
  const patch = (): EmployeePatch => {
    const p: EmployeePatch = {};
    if (!employee) return p;
    if (name.trim() !== employee.name) p.name = name.trim();
    if (position.trim() !== employee.position) p.position = position.trim();
    if ((deptId === "" ? null : deptId) !== employee.deptId) p.deptId = deptId === "" ? null : deptId;
    if ((projectId === "" ? null : projectId) !== employee.projectId) p.projectId = projectId === "" ? null : projectId;
    if (phone.trim() !== employee.phone) p.phone = phone.trim();
    if (email.trim() !== employee.email) p.email = email.trim();
    if (isoDate(birthday) !== employee.birthday) p.birthday = isoDate(birthday);
    if (isoDate(hired) && isoDate(hired) !== employee.hired) p.hired = isoDate(hired) as string;
    const s = parseNumber(salary);
    if (s != null && s !== employee.salary) p.salary = String(s);
    const v = parseNumber(vacationLeft);
    if (v != null && v !== employee.vacationLeft) p.vacationLeft = Math.round(v);
    if ((staffingPositionId === "" ? null : staffingPositionId) !== employee.staffingPositionId) p.staffingPositionId = staffingPositionId === "" ? null : staffingPositionId;
    return p;
  };
  const input = () => ({
    name,
    position,
    hired: isoDate(hired) as string,
    deptId: deptId === "" ? null : deptId,
    projectId: projectId === "" ? null : projectId,
    salary: parseNumber(salary) != null ? String(parseNumber(salary)) : "",
    phone,
    email,
    birthday: isoDate(birthday),
    probation,
    staffingPositionId: staffingPositionId === "" ? null : staffingPositionId,
  });
  const save = useMutation({
    mutationFn: () => (editing ? updateEmployee(employee.id, patch(), scope) : vacancy ? hireByVacancy(vacancy.id, input(), scope).then((r) => r.card) : createEmployee(input(), scope)),
    onSuccess: (card) => {
      refresh();
      enqueueSnackbar(editing ? t("staff.card.saved") : t("staff.form.created"), { variant: "success" });
      onClose();
      if (!editing) onCreated?.(card.employee.id);
    },
  });
  const salaryBad = salary.trim() !== "" && (parseNumber(salary) == null || (parseNumber(salary) as number) < 0);
  const vacationBad = editing && vacationLeft.trim() !== "" && (parseNumber(vacationLeft) == null || (parseNumber(vacationLeft) as number) < 0);
  const invalid = { name: !name.trim(), position: !position.trim(), hired: !isoDate(hired), salary: salaryBad, vacation: vacationBad };
  const hasErrors = Object.values(invalid).some(Boolean);
  const req = (bad: boolean) => (touched && bad ? t("common.required") : undefined);

  return (
    <FormDrawer
      open={open}
      title={editing ? t("staff.form.editTitle", { name: employee.name }) : vacancy ? t("staff.form.hireTitle", { title: vacancy.title }) : t("staff.form.newTitle")}
      submitLabel={editing ? t("common.save") : t("staff.form.create")}
      busy={save.isPending}
      error={save.error}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (hasErrors) return;
        if (editing && Object.keys(patch()).length === 0) return onClose();
        save.mutate();
      }}
    >
      <TextField size="small" label={t("staff.form.name")} value={name} onChange={(ev) => setName(ev.target.value)} error={touched && invalid.name} helperText={req(invalid.name)} />
      <TextField size="small" label={t("staff.form.position")} value={position} onChange={(ev) => setPosition(ev.target.value)} error={touched && invalid.position} helperText={req(invalid.position)} />
      <TextField
        select
        size="small"
        label={t("staff.form.staffingPosition")}
        value={staffingPositionId}
        onChange={(ev) => pickPosition(ev.target.value === "" ? "" : Number(ev.target.value))}
        SelectProps={{ displayEmpty: true }}
        InputLabelProps={{ shrink: true }}
        helperText={t("staff.form.staffingPositionHint")}
      >
        <MenuItem value="">{t("staff.form.noStaffingPosition")}</MenuItem>
        {positions.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {[p.deptName, p.title].filter(Boolean).join(" · ")}
            {p.vacant > 0 ? ` — ${t("vacancies.form.vacant", { count: p.vacant })}` : ""}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        <TextField select size="small" label={t("staff.form.dept")} value={deptId} onChange={(ev) => setDeptId(ev.target.value === "" ? "" : Number(ev.target.value))} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
          <MenuItem value="">—</MenuItem>
          {departments.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {d.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label={t("staff.form.project")} value={projectId} onChange={(ev) => setProjectId(ev.target.value === "" ? "" : Number(ev.target.value))} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
          <MenuItem value="">—</MenuItem>
          {projects.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        <TextField size="small" label={t("staff.form.salary")} value={salary} inputMode="decimal" onChange={(ev) => setSalary(ev.target.value)} error={touched && invalid.salary} helperText={touched && invalid.salary ? t("common.number") : undefined} />
        <CustomDatePicker
          label={t("staff.form.hired")}
          value={hired}
          onChange={(v) => setHired(v as Dayjs | null)}
          slotProps={{ textField: { size: "small", fullWidth: true, error: touched && invalid.hired, helperText: req(invalid.hired) } }}
        />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        <TextField size="small" label={t("staff.form.phone")} value={phone} inputMode="tel" onChange={(ev) => setPhone(ev.target.value)} />
        <TextField size="small" label={t("staff.form.email")} value={email} inputMode="email" onChange={(ev) => setEmail(ev.target.value)} />
      </Box>
      <CustomDatePicker label={t("staff.form.birthday")} value={birthday} onChange={(v) => setBirthday(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
      {editing ? (
        <TextField size="small" label={t("staff.form.vacationLeft")} value={vacationLeft} inputMode="numeric" onChange={(ev) => setVacationLeft(ev.target.value)} error={touched && invalid.vacation} helperText={touched && invalid.vacation ? t("common.number") : undefined} />
      ) : (
        <FormControlLabel control={<Checkbox size="small" checked={probation} onChange={(ev) => setProbation(ev.target.checked)} />} label={t("staff.form.probation")} />
      )}
    </FormDrawer>
  );
}

function RaiseDialog({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const refresh = useRefreshPersonnel();
  const { enqueueSnackbar } = useSnackbar();
  const [position, setPosition] = React.useState("");
  const [salary, setSalary] = React.useState("");
  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => raiseEmployee(employee?.id as number, { position, salary: String(parseNumber(salary)), date: isoDate(date) as string, reason }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("staff.card.raised"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!employee) return;
    setPosition(employee.position);
    setSalary(employee.salary != null ? String(employee.salary) : "");
    setDate(dayjs());
    setReason("");
    setTouched(false);
    save.reset();
  }, [employee]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const invalid = { position: !position.trim(), salary: parseNumber(salary) == null || (parseNumber(salary) as number) <= 0, date: !isoDate(date), reason: !reason.trim() };
  return (
    <ConfirmDialog
      open={employee != null}
      title={t("staff.raiseForm.title")}
      text={employee?.name}
      confirmLabel={t("staff.raiseForm.save")}
      busy={save.isPending}
      error={save.error}
      onConfirm={() => {
        setTouched(true);
        if (!Object.values(invalid).some(Boolean)) save.mutate();
      }}
      onClose={onClose}
    >
      <TextField size="small" label={t("staff.raiseForm.position")} value={position} onChange={(ev) => setPosition(ev.target.value)} error={touched && invalid.position} helperText={touched && invalid.position ? t("common.required") : undefined} />
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <TextField size="small" label={t("staff.raiseForm.salary")} value={salary} inputMode="decimal" onChange={(ev) => setSalary(ev.target.value)} error={touched && invalid.salary} helperText={touched && invalid.salary ? t("common.amountInvalid") : undefined} />
        <CustomDatePicker label={t("staff.raiseForm.date")} value={date} onChange={(v) => setDate(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true, error: touched && invalid.date } }} />
      </Box>
      <TextField size="small" label={t("staff.raiseForm.reason")} value={reason} onChange={(ev) => setReason(ev.target.value)} error={touched && invalid.reason} helperText={touched && invalid.reason ? t("common.required") : undefined} />
    </ConfirmDialog>
  );
}

/** Отпуск / больничный / командировка — отметки «О» / «Б» / «К» в табеле ставит сервер. */
function AbsenceDialog({ employee, kind, onClose }: { employee: Employee | null; kind: AbsenceKind; onClose: () => void }) {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const refresh = useRefreshPersonnel();
  const { enqueueSnackbar } = useSnackbar();
  const [from, setFrom] = React.useState<Dayjs | null>(dayjs());
  const [days, setDays] = React.useState("");
  const [type, setType] = React.useState<VacationType>("annual");
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const save = useMutation({
    mutationFn: () => registerAbsence(employee?.id as number, kind, { from: isoDate(from) as string, days: Math.round(parseNumber(days) as number), type, note }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("staff.card.absenceSaved"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!employee) return;
    setFrom(dayjs().add(1, "day"));
    setDays(kind === "vacation" ? "14" : "3");
    setType("annual");
    setNote("");
    setTouched(false);
    save.reset();
  }, [employee, kind]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  const d = parseNumber(days);
  const invalid = { from: !isoDate(from), days: d == null || d < 1 || !Number.isInteger(d) };
  return (
    <ConfirmDialog
      open={employee != null}
      title={t(`staff.absenceForm.title_${kind}`)}
      text={employee ? `${employee.name}${kind === "vacation" ? ` · ${t("staff.absenceForm.left", { count: employee.vacationLeft })}` : ""}` : null}
      confirmLabel={t("staff.absenceForm.save")}
      busy={save.isPending}
      error={save.error}
      onConfirm={() => {
        setTouched(true);
        if (!invalid.from && !invalid.days) save.mutate();
      }}
      onClose={onClose}
    >
      <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 1.5 }}>
        <CustomDatePicker label={t("staff.absenceForm.from")} value={from} onChange={(v) => setFrom(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true, error: touched && invalid.from } }} />
        <TextField size="small" label={t("staff.absenceForm.days")} value={days} inputMode="numeric" onChange={(ev) => setDays(ev.target.value)} error={touched && invalid.days} helperText={touched && invalid.days ? t("common.number") : undefined} />
      </Box>
      {kind === "vacation" ? (
        <TextField select size="small" label={t("staff.absenceForm.type")} value={type} onChange={(ev) => setType(ev.target.value as VacationType)}>
          {VACATION_TYPES.map((v) => (
            <MenuItem key={v} value={v}>
              {t(`staff.absenceForm.type_${v}`)}
            </MenuItem>
          ))}
        </TextField>
      ) : (
        <TextField size="small" label={t("staff.absenceForm.note")} value={note} onChange={(ev) => setNote(ev.target.value)} />
      )}
    </ConfirmDialog>
  );
}

function FireDialog({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const refresh = useRefreshPersonnel();
  const { enqueueSnackbar } = useSnackbar();
  const reasons = t("staff.fireForm.reasons").split("|");
  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const [reason, setReason] = React.useState(reasons[0]);
  const save = useMutation({
    mutationFn: () => fireEmployee(employee?.id as number, { date: isoDate(date) as string, reason }, scope),
    onSuccess: () => {
      refresh();
      enqueueSnackbar(t("staff.card.fired"), { variant: "success" });
      onClose();
    },
  });
  React.useEffect(() => {
    if (!employee) return;
    setDate(dayjs());
    setReason(reasons[0]);
    save.reset();
  }, [employee]); // eslint-disable-line react-hooks/exhaustive-deps -- сброс формы при открытии
  return (
    <ConfirmDialog
      open={employee != null}
      title={t("staff.fireForm.title", { name: employee?.name ?? "" })}
      text={t("staff.fireForm.text")}
      confirmLabel={t("staff.fireForm.save")}
      busy={save.isPending}
      error={save.error}
      danger
      onConfirm={() => isoDate(date) && save.mutate()}
      onClose={onClose}
    >
      <CustomDatePicker label={t("staff.fireForm.date")} value={date} onChange={(v) => setDate(v as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
      <TextField select size="small" label={t("staff.fireForm.reason")} value={reason} onChange={(ev) => setReason(ev.target.value)}>
        {reasons.map((r) => (
          <MenuItem key={r} value={r}>
            {r}
          </MenuItem>
        ))}
      </TextField>
    </ConfirmDialog>
  );
}
