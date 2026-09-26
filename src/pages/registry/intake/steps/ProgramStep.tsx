import React from "react";
import { Alert, ListSubheader, MenuItem, Stack, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getBranches } from "../../../../api/organization";
import { getProgramPackages, getPrograms, type Program } from "../../../../api/programs";
import { djangoQueryKeys } from "../../../../api/queryKeys";
import { getNextCardNumber, type PriceQuote } from "../../../../api/registry";
import { CustomDatePicker } from "../../../../components/ui";
import type { ActiveScope } from "../../../../hooks/useActiveScope";
import { doctorEmployeesOnly, useAllActiveEmployees } from "../../../../hooks/useAllActiveEmployees";
import { usePermissions } from "../../../../hooks/usePermissions";
import { useT } from "../../../../i18n/VerticalProvider";
import { quoteMessage } from "../../priceQuote";
import { programCardPrefix, programSpecializationIds, RESIDENCE_STATUSES } from "../../registryConstants";
import { formatMoney } from "../../registryTabs";
import type { ProgramState, StepErrors } from "../intakeState";

const MONEY_RE = /^\d{0,10}(?:[.,]\d{0,2})?$/;

interface ProgramStepProps {
  scope: ActiveScope;
  value: ProgramState;
  errors: StepErrors;
  /** Номер карты уже есть у выбранного ребёнка — поле не нужно. */
  childCardNumber: string;
  /** Расчёт цены с сервера: цена пакета и семейная скидка. */
  quote?: PriceQuote;
  onChange: (next: ProgramState) => void;
  onProgramLoaded: (program: Program | undefined) => void;
}

export const ProgramStep: React.FC<ProgramStepProps> = ({
  scope,
  value,
  errors,
  childCardNumber,
  quote,
  onChange,
  onProgramLoaded,
}) => {
  const { t } = useT("registry");
  const { activeOrganization, activeBranch } = usePermissions();
  const ready = scope.isReady && scope.orgReady;
  const programs = useQuery({
    queryKey: djangoQueryKeys.programs.list(scope),
    queryFn: ({ signal }) => getPrograms(scope, signal),
    enabled: ready,
  });
  const packages = useQuery({
    queryKey: djangoQueryKeys.programs.packages(scope, { active: true }),
    queryFn: ({ signal }) => getProgramPackages(scope, { active: true }, signal),
    enabled: ready,
  });
  const branches = useQuery({
    queryKey: ["django", "organization", "branches", activeOrganization?.id ?? null],
    queryFn: () => getBranches(activeOrganization?.id),
    enabled: ready && !activeBranch,
  });
  const { employees } = useAllActiveEmployees(ready);

  const livePrograms = React.useMemo(
    () => (programs.data?.results ?? []).filter((p) => p.status === "active" && p.isEnabled && p.isRegistry),
    [programs.data?.results],
  );
  const offered = React.useMemo(
    () => (packages.data ?? []).filter((item) => livePrograms.some((p) => p.id === item.programId)),
    [packages.data, livePrograms],
  );
  const pkg = offered.find((item) => item.id === value.packageId);
  const program = livePrograms.find((p) => p.id === pkg?.programId);
  const branchOptions = activeBranch
    ? [{ id: activeBranch.id, name: activeBranch.name }]
    : (branches.data ?? []).filter((b) => b.isActive);
  const wanted = programSpecializationIds(program);
  const doctors = React.useMemo(() => {
    const pool = wanted.length
      ? employees.filter((e) => e.specializations.some((s) => wanted.includes(s.id)))
      : doctorEmployeesOnly(employees);
    return value.branchId == null
      ? pool
      : pool.filter((e) => e.branch == null || e.branch.id === value.branchId
        || e.operationalBranches.some((b) => b.id === value.branchId));
  }, [employees, wanted, value.branchId]);
  const prefix = programCardPrefix(program);
  const suggestion = useQuery({
    queryKey: ["django", "patients", "next-card-number", scope, prefix],
    queryFn: ({ signal }) => getNextCardNumber(scope, prefix, signal),
    enabled: ready && program != null && !childCardNumber,
  });

  React.useEffect(() => {
    onProgramLoaded(program);
  }, [program, onProgramLoaded]);

  // Единственный пакет и единственный филиал подставляем сами.
  const onlyPackage = offered.length === 1 ? offered[0] : undefined;
  const onlyBranchId = branchOptions.length === 1 ? branchOptions[0].id : undefined;
  React.useEffect(() => {
    const patch: Partial<ProgramState> = {};
    if (value.packageId == null && onlyPackage) {
      patch.packageId = onlyPackage.id;
      patch.termMonths = String(onlyPackage.termMonths);
    }
    if (value.branchId == null && onlyBranchId != null) patch.branchId = onlyBranchId;
    if (Object.keys(patch).length) onChange({ ...value, ...patch });
  }, [onlyPackage, onlyBranchId, value, onChange]);

  const error = (key: string) => (errors[key] ? t(errors[key]) : undefined);

  if (programs.isSuccess && packages.isSuccess && offered.length === 0) {
    return <Alert severity="info">{t("wizard.program.noPackages")}</Alert>;
  }

  const showPrograms = new Set(offered.map((item) => item.programId)).size > 1;
  const packageOptions = offered.flatMap((item, index) => [
    ...(showPrograms && offered[index - 1]?.programId !== item.programId
      ? [<ListSubheader key={`program-${item.programId}`}>{item.programName}</ListSubheader>]
      : []),
    <MenuItem key={item.id} value={item.id}>
      {item.name} · {formatMoney(item.priceAmount)} сом
    </MenuItem>,
  ]);
  const message = quote ? quoteMessage(quote) : null;

  return (
    <Stack gap={2}>
      <TextField
        select
        size="small"
        label={t("wizard.program.package")}
        value={value.packageId ?? ""}
        error={Boolean(errors.packageId)}
        helperText={error("packageId")}
        onChange={(e) => {
          const next = offered.find((item) => item.id === Number(e.target.value));
          onChange({
            ...value,
            packageId: next?.id ?? null,
            termMonths: next ? String(next.termMonths) : value.termMonths,
            responsibleEmployeeId: next?.programId === pkg?.programId ? value.responsibleEmployeeId : null,
          });
        }}
      >
        {packageOptions}
      </TextField>
      {!activeBranch && (
        <TextField
          select
          size="small"
          label={t("wizard.program.branch")}
          value={value.branchId ?? ""}
          error={Boolean(errors.branchId)}
          helperText={error("branchId")}
          onChange={(e) => onChange({ ...value, branchId: Number(e.target.value), responsibleEmployeeId: null })}
        >
          {branchOptions.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      <TextField
        select
        size="small"
        label={t("wizard.program.doctor")}
        value={value.responsibleEmployeeId ?? ""}
        onChange={(e) =>
          onChange({ ...value, responsibleEmployeeId: e.target.value === "" ? null : Number(e.target.value) })
        }
      >
        <MenuItem value="">{t("wizard.program.noDoctor")}</MenuItem>
        {doctors.map((employee) => (
          <MenuItem key={employee.id} value={employee.id}>
            {employee.fullName}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
        <TextField
          size="small"
          type="number"
          label={t("wizard.program.term")}
          value={value.termMonths}
          onChange={(e) => onChange({ ...value, termMonths: e.target.value })}
          error={Boolean(errors.termMonths)}
          helperText={error("termMonths")}
          inputProps={{ min: 1, max: 60 }}
        />
        <TextField
          size="small"
          label={t("wizard.program.price")}
          value={value.priceAmount}
          onChange={(e) => {
            if (MONEY_RE.test(e.target.value)) onChange({ ...value, priceAmount: e.target.value });
          }}
          helperText={message ? t(message.key, message.values) : undefined}
          inputProps={{ inputMode: "decimal" }}
        />
      </Stack>
      <CustomDatePicker
        label={t("wizard.program.startsOn")}
        value={value.termStartsOn ? dayjs(value.termStartsOn) : null}
        onChange={(date) =>
          onChange({ ...value, termStartsOn: date && date.isValid() ? date.format("YYYY-MM-DD") : "" })
        }
        slotProps={{ textField: { size: "small", helperText: t("wizard.program.startsOnHint") } }}
      />
      <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
        <TextField
          select
          size="small"
          label={t("wizard.program.residence")}
          value={value.residenceStatus}
          onChange={(e) => onChange({ ...value, residenceStatus: e.target.value as ProgramState["residenceStatus"] })}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">{t("wizard.program.residenceNone")}</MenuItem>
          {RESIDENCE_STATUSES.map((status) => (
            <MenuItem key={status} value={status}>
              {t(`wizard.program.residenceStatuses.${status}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label={t("wizard.program.arrivedFrom")}
          value={value.arrivedFrom}
          onChange={(e) => onChange({ ...value, arrivedFrom: e.target.value.slice(0, 255) })}
          helperText={t("wizard.program.arrivedFromHint")}
          sx={{ flex: 1 }}
        />
      </Stack>
      {!childCardNumber && (
        <TextField
          size="small"
          label={t("wizard.child.cardNumber")}
          value={value.cardNumber}
          placeholder={suggestion.data?.cardNumber}
          onChange={(e) => onChange({ ...value, cardNumber: e.target.value.slice(0, 32) })}
          helperText={t("wizard.child.cardNumberHint")}
        />
      )}
    </Stack>
  );
};
