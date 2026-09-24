import React from "react";
import { Alert, MenuItem, Stack, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getBranches } from "../../../../api/organization";
import { getPrograms, isRegistryProgram, type Program } from "../../../../api/programs";
import { djangoQueryKeys } from "../../../../api/queryKeys";
import { getNextCardNumber } from "../../../../api/registry";
import { CustomDatePicker } from "../../../../components/ui";
import type { ActiveScope } from "../../../../hooks/useActiveScope";
import { doctorEmployeesOnly, useAllActiveEmployees } from "../../../../hooks/useAllActiveEmployees";
import { usePermissions } from "../../../../hooks/usePermissions";
import { useT } from "../../../../i18n/VerticalProvider";
import { programCardPrefix, programSpecializationIds } from "../../registryConstants";
import type { ProgramState, StepErrors } from "../intakeState";

const MONEY_RE = /^\d{0,10}(?:[.,]\d{0,2})?$/;

interface ProgramStepProps {
  scope: ActiveScope;
  value: ProgramState;
  errors: StepErrors;
  /** Номер карты уже есть у выбранного ребёнка — поле не нужно. */
  childCardNumber: string;
  onChange: (next: ProgramState) => void;
  onProgramLoaded: (program: Program | undefined) => void;
}

export const ProgramStep: React.FC<ProgramStepProps> = ({
  scope,
  value,
  errors,
  childCardNumber,
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
  const branches = useQuery({
    queryKey: ["django", "organization", "branches", activeOrganization?.id ?? null],
    queryFn: () => getBranches(activeOrganization?.id),
    enabled: ready && !activeBranch,
  });
  const { employees } = useAllActiveEmployees(ready);

  const registryPrograms = React.useMemo(
    () => (programs.data?.results ?? []).filter((p) => p.status === "active" && p.isEnabled && isRegistryProgram(p)),
    [programs.data?.results],
  );
  const program = registryPrograms.find((p) => p.id === value.programId);
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

  // Единственную программу и единственный филиал подставляем сами.
  const onlyProgram = registryPrograms.length === 1 ? registryPrograms[0] : undefined;
  const onlyBranchId = branchOptions.length === 1 ? branchOptions[0].id : undefined;
  React.useEffect(() => {
    const patch: Partial<ProgramState> = {};
    if (value.programId == null && onlyProgram) {
      patch.programId = onlyProgram.id;
      patch.termMonths = String(onlyProgram.defaultTermMonths);
    }
    if (value.branchId == null && onlyBranchId != null) patch.branchId = onlyBranchId;
    if (Object.keys(patch).length) onChange({ ...value, ...patch });
  }, [onlyProgram, onlyBranchId, value, onChange]);

  const error = (key: string) => (errors[key] ? t(errors[key]) : undefined);

  if (programs.isSuccess && registryPrograms.length === 0) {
    return <Alert severity="info">{t("wizard.program.noPrograms")}</Alert>;
  }

  return (
    <Stack gap={2}>
      <TextField
        select
        size="small"
        label={t("wizard.program.program")}
        value={value.programId ?? ""}
        error={Boolean(errors.programId)}
        helperText={error("programId")}
        onChange={(e) => {
          const next = registryPrograms.find((p) => p.id === Number(e.target.value));
          onChange({
            ...value,
            programId: next?.id ?? null,
            termMonths: next ? String(next.defaultTermMonths) : value.termMonths,
            responsibleEmployeeId: null,
          });
        }}
      >
        {registryPrograms.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
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
          helperText={program?.feeServiceName ? t("wizard.program.priceHint", { service: program.feeServiceName }) : undefined}
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
