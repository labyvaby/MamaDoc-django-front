import React from "react";
import { FormControlLabel, MenuItem, Stack, Switch, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { getBranches } from "../../api/organization";
import { getPrograms, isRegistryProgram } from "../../api/programs";
import { djangoQueryKeys } from "../../api/queryKeys";
import type { ActiveScope } from "../../hooks/useActiveScope";
import { doctorEmployeesOnly, useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { usePermissions } from "../../hooks/usePermissions";
import { useT } from "../../i18n/VerticalProvider";

export interface RegistryFilterValues {
  branchId?: number;
  employeeId?: number;
  programId?: number;
  ageFromMonths?: number;
  ageToMonths?: number;
  q: string;
  mine: boolean;
}

interface RegistryFiltersProps {
  scope: ActiveScope;
  value: RegistryFilterValues;
  onChange: (next: RegistryFilterValues) => void;
}

function toNumber(raw: string): number | undefined {
  if (raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export const RegistryFilters: React.FC<RegistryFiltersProps> = ({ scope, value, onChange }) => {
  const { t } = useT("registry");
  const { activeOrganization, activeBranch } = usePermissions();
  const ready = scope.isReady && scope.orgReady;
  const branches = useQuery({
    queryKey: ["django", "organization", "branches", activeOrganization?.id ?? null],
    queryFn: () => getBranches(activeOrganization?.id),
    enabled: !activeBranch && ready,
  });
  const programs = useQuery({
    queryKey: djangoQueryKeys.programs.list(scope),
    queryFn: ({ signal }) => getPrograms(scope, signal),
    enabled: ready,
  });
  const { employees } = useAllActiveEmployees(ready);
  const doctors = React.useMemo(() => doctorEmployeesOnly(employees), [employees]);
  const registryPrograms = (programs.data?.results ?? []).filter(isRegistryProgram);

  return (
    <Stack direction={{ xs: "column", md: "row" }} gap={1} alignItems={{ md: "center" }} flexWrap="wrap">
      <TextField
        size="small"
        label={t("page.search")}
        value={value.q}
        onChange={(e) => onChange({ ...value, q: e.target.value })}
        sx={{ minWidth: { md: 260 } }}
      />
      {!activeBranch && (
        <TextField
          select
          size="small"
          label={t("page.branch")}
          value={value.branchId ?? ""}
          onChange={(e) => onChange({ ...value, branchId: toNumber(e.target.value) })}
          sx={{ minWidth: { md: 180 } }}
        >
          <MenuItem value="">{t("page.allBranches")}</MenuItem>
          {(branches.data ?? []).map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      <TextField
        select
        size="small"
        label={t("columns.doctor")}
        value={value.employeeId ?? ""}
        disabled={value.mine}
        onChange={(e) => onChange({ ...value, employeeId: toNumber(e.target.value), mine: false })}
        sx={{ minWidth: { md: 200 } }}
      >
        <MenuItem value="">{t("page.allBranches")}</MenuItem>
        {doctors.map((employee) => (
          <MenuItem key={employee.id} value={employee.id}>
            {employee.fullName}
          </MenuItem>
        ))}
      </TextField>
      {registryPrograms.length > 1 && (
        <TextField
          select
          size="small"
          label={t("columns.program")}
          value={value.programId ?? ""}
          onChange={(e) => onChange({ ...value, programId: toNumber(e.target.value) })}
          sx={{ minWidth: { md: 200 } }}
        >
          <MenuItem value="">{t("page.allBranches")}</MenuItem>
          {registryPrograms.map((program) => (
            <MenuItem key={program.id} value={program.id}>
              {program.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Stack direction="row" gap={1}>
        <TextField
          size="small"
          type="number"
          label={t("page.ageFrom")}
          value={value.ageFromMonths ?? ""}
          onChange={(e) => onChange({ ...value, ageFromMonths: toNumber(e.target.value) })}
          inputProps={{ min: 0 }}
          sx={{ width: 150 }}
        />
        <TextField
          size="small"
          type="number"
          label={t("page.ageTo")}
          value={value.ageToMonths ?? ""}
          onChange={(e) => onChange({ ...value, ageToMonths: toNumber(e.target.value) })}
          inputProps={{ min: 0 }}
          sx={{ width: 110 }}
        />
      </Stack>
      <FormControlLabel
        control={
          <Switch
            checked={value.mine}
            onChange={(_, checked) => onChange({ ...value, mine: checked, employeeId: undefined })}
          />
        }
        label={t("page.mine")}
      />
    </Stack>
  );
};
