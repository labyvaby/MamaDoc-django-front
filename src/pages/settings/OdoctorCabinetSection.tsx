import React from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createOdoctorLink,
  deleteOdoctorLink,
  getOdoctorBranches,
  getOdoctorCabinetDoctors,
  odoctorCabinetRowState,
  odoctorLinkedBranches,
  odoctorSettingsErrorMessage,
  type OdoctorCabinetDoctor,
} from "../../api/odoctor";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { getDjangoEmployees } from "../../api/staff";
import { useT } from "../../i18n/VerticalProvider";

/** Сотрудник в выпадающем списке — минимум, который нужен выбору. */
interface EmployeeOption {
  id: number;
  fullName: string;
}

/**
 * Сопоставление врачей клиники с врачами кабинета odoctor.
 *
 * Список идёт со стороны кабинета, а не CRM. Его список конечный и
 * авторитетный — в живом кабинете четырнадцать врачей против двадцати шести
 * сотрудников клиники, из которых дюжина тестовые, — поэтому каждая строка
 * это действие. Обратную сторону он показывает тоже: врача, который в витрине
 * стоит, а клиника его уже не ведёт.
 *
 * Совпадение ФИО остаётся подсказкой. Автоматически сопоставлять нельзя
 * (§5.2 спеки): кабинет из опознавательных данных отдаёт по сути одно имя, и
 * этот же кабинет даёт доказательство — «Кулушова Адинай Канаатова» против
 * «Канаатовны» в CRM, «Сагынбекова Айдана» против «Айдааны», «Сурап
 * Бекмамат» против «Сурап уулу Бекмамат». Однофамильцы не подставляются вовсе.
 *
 * Сопоставить — не значит включить. Связь создаётся выключенной, и окна
 * пойдут только после тумблера в карточке врача, который проходит через
 * предпросмотр. Поэтому ошибка на этом экране ничего не публикует.
 */
export function OdoctorCabinetSection({
  organizationId,
  disabled,
}: {
  organizationId?: number;
  disabled?: boolean;
}) {
  const { t } = useT("settings");
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = React.useState<number | null>(null);
  const [picks, setPicks] = React.useState<Record<number, number | null>>({});
  const [unlinking, setUnlinking] = React.useState<OdoctorCabinetDoctor | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [cleared, setCleared] = React.useState<number | null>(null);

  const branchesQuery = useQuery({
    queryKey: djangoQueryKeys.odoctor.branches(organizationId ?? null),
    queryFn: ({ signal }) => getOdoctorBranches(signal, { organizationId }),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const branches = odoctorLinkedBranches(branchesQuery.data);
  const selected = branches.find((branch) => branch.branchId === branchId)
    ?? branches[0]
    ?? null;

  const doctorsQuery = useQuery({
    queryKey: djangoQueryKeys.odoctor.cabinetDoctors(selected?.branchId ?? 0),
    queryFn: ({ signal }) =>
      getOdoctorCabinetDoctors(selected!.branchId, signal),
    enabled: selected !== null,
    // Ходит в живой кабинет: вчерашний список врачей под видом сегодняшнего
    // отправит оператора сопоставлять то, чего там уже нет.
    staleTime: 0,
    gcTime: 0,
  });

  // Врачи CRM для строк, где ФИО разошлись. Только врачи: тумблер витрины
  // живёт в карточке врача, и сопоставленный «администратор» остался бы с
  // связью, которую негде включить.
  const employeesQuery = useQuery({
    queryKey: [
      ...djangoQueryKeys.reference.employees,
      "odoctor-cabinet",
      organizationId ?? null,
    ],
    queryFn: ({ signal }) =>
      getDjangoEmployees(
        { status: "active", pageSize: 200, organizationId },
        signal,
      ),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const options: EmployeeOption[] = React.useMemo(
    () =>
      (employeesQuery.data?.results ?? [])
        .filter((employee) => employee.clinicalRole === "doctor")
        .map((employee) => ({
          id: Number(employee.id),
          fullName: employee.fullName,
        })),
    [employeesQuery.data],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: djangoQueryKeys.odoctor.cabinetDoctors(
        selected?.branchId ?? 0,
      ),
    });
    void queryClient.invalidateQueries({
      queryKey: djangoQueryKeys.odoctor.branches(organizationId ?? null),
    });
    // Карточка врача и список связей показывают ту же связь.
    void queryClient.invalidateQueries({
      queryKey: ["django", "odoctor", "links"],
    });
  };

  const link = useMutation({
    mutationFn: (input: { employeeId: number; odoctorDoctorId: number }) =>
      createOdoctorLink({ branchId: selected!.branchId, ...input }),
    onSuccess: (_created, input) => {
      setError(null);
      setPicks((current) => {
        const next = { ...current };
        delete next[input.odoctorDoctorId];
        return next;
      });
      refresh();
    },
    onError: (err) => setError(odoctorSettingsErrorMessage(err)),
  });

  const unlink = useMutation({
    mutationFn: (linkId: number) => deleteOdoctorLink(linkId),
    onSuccess: (result) => {
      setError(null);
      setUnlinking(null);
      setCleared(result.daysCleared);
      refresh();
    },
    onError: (err) => setError(odoctorSettingsErrorMessage(err)),
  });

  const busy = disabled || link.isPending || unlink.isPending;

  if (branchesQuery.isPending) {
    return (
      <Stack alignItems="center" py={3}>
        <CircularProgress size={24} />
      </Stack>
    );
  }

  return (
    <>
      <Divider />
      <Stack spacing={1}>
        <Typography variant="subtitle1" fontWeight={600}>
          {t("odoctor.cabinet.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("odoctor.cabinet.description")}
        </Typography>
      </Stack>

      {branchesQuery.isError && (
        <Alert severity="warning">
          {odoctorSettingsErrorMessage(branchesQuery.error)}
        </Alert>
      )}

      {!branchesQuery.isError && branches.length === 0 && (
        <Alert severity="info">{t("odoctor.cabinet.noBranches")}</Alert>
      )}

      {branches.length > 1 && (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={selected?.branchId ?? null}
          onChange={(_event, value) => {
            if (value !== null) {
              setBranchId(value as number);
            }
          }}
        >
          {branches.map((branch) => (
            <ToggleButton key={branch.branchId} value={branch.branchId}>
              {branch.branchName}
              {branch.mappedDoctors > 0 ? ` · ${branch.mappedDoctors}` : ""}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}

      {selected && doctorsQuery.isPending && (
        <Stack alignItems="center" py={3} spacing={1}>
          <CircularProgress size={24} />
          <Typography variant="caption" color="text.secondary">
            {t("odoctor.cabinet.loading")}
          </Typography>
        </Stack>
      )}

      {selected && doctorsQuery.isError && (
        <Alert severity="warning">
          {odoctorSettingsErrorMessage(doctorsQuery.error)}
        </Alert>
      )}

      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {cleared !== null && (
        <Alert severity="success" onClose={() => setCleared(null)}>
          {cleared > 0
            ? t("odoctor.cabinet.unlinkedWithDays", { days: cleared })
            : t("odoctor.cabinet.unlinked")}
        </Alert>
      )}

      {doctorsQuery.data && doctorsQuery.data.items.length === 0 && (
        <Alert severity="info">{t("odoctor.cabinet.emptyCabinet")}</Alert>
      )}

      {doctorsQuery.data && doctorsQuery.data.items.length > 0 && (
        <Table size="small" sx={{ "& td, & th": { px: 1 } }}>
          <TableHead>
            <TableRow>
              <TableCell>{t("odoctor.cabinet.columnCabinet")}</TableCell>
              <TableCell>{t("odoctor.cabinet.columnCrm")}</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {doctorsQuery.data.items.map((row) => {
              const state = odoctorCabinetRowState(row);
              const suggested =
                state === "suggested" ? row.candidates[0].employeeId : null;
              const pickedId = picks[row.odoctorDoctorId] ?? suggested;
              const picked =
                options.find((option) => option.id === pickedId) ?? null;
              return (
                <TableRow key={row.odoctorDoctorId}>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="body2">
                        {row.odoctorDoctorName}
                      </Typography>
                      {!row.inCabinet && (
                        <Typography variant="caption" color="warning.main">
                          {t("odoctor.cabinet.gone")}
                        </Typography>
                      )}
                      {row.inCabinet && !row.isActive && (
                        <Typography variant="caption" color="text.secondary">
                          {t("odoctor.cabinet.unpublished")}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ minWidth: 240 }}>
                    {state === "linked" ? (
                      <Stack
                        direction="row"
                        alignItems="center"
                        gap={1}
                        flexWrap="wrap"
                      >
                        <Typography variant="body2">
                          {row.linkedEmployeeName}
                        </Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={t("odoctor.cabinet.mapped")}
                        />
                      </Stack>
                    ) : (
                      <Stack spacing={0.25}>
                        <Autocomplete
                          size="small"
                          options={options}
                          loading={employeesQuery.isPending}
                          value={picked}
                          isOptionEqualToValue={(option, value) =>
                            option.id === value.id
                          }
                          getOptionLabel={(option) => option.fullName}
                          onChange={(_event, value) =>
                            setPicks((current) => ({
                              ...current,
                              [row.odoctorDoctorId]: value?.id ?? null,
                            }))
                          }
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              placeholder={t("odoctor.cabinet.pick")}
                            />
                          )}
                          disabled={busy}
                        />
                        {state === "ambiguous" && (
                          <Typography variant="caption" color="warning.main">
                            {t("odoctor.cabinet.ambiguous", {
                              matches: row.candidates.length,
                            })}
                          </Typography>
                        )}
                        {state === "manual" && (
                          <Typography variant="caption" color="text.secondary">
                            {t("odoctor.cabinet.manual")}
                          </Typography>
                        )}
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {state === "linked" ? (
                      <Button
                        size="small"
                        color="inherit"
                        disabled={busy}
                        onClick={() => {
                          setError(null);
                          setUnlinking(row);
                        }}
                      >
                        {t("odoctor.cabinet.unlink")}
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={busy || pickedId == null}
                        onClick={() => {
                          setError(null);
                          link.mutate({
                            employeeId: pickedId!,
                            odoctorDoctorId: row.odoctorDoctorId,
                          });
                        }}
                      >
                        {t("odoctor.cabinet.link")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {doctorsQuery.data && (
        <Typography variant="caption" color="text.secondary">
          {t("odoctor.cabinet.footnote")}
        </Typography>
      )}

      <Dialog
        open={unlinking !== null}
        onClose={() => setUnlinking(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ pb: 1 }}>
          {t("odoctor.cabinet.unlinkTitle")}
        </DialogTitle>
        <DialogContent dividers>
          <DialogContentText variant="body2">
            {t("odoctor.cabinet.unlinkBody", {
              name: unlinking?.odoctorDoctorName ?? "",
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnlinking(null)}>
            {t("odoctor.cabinet.cancel")}
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={unlink.isPending}
            onClick={() =>
              unlinking?.linkId != null && unlink.mutate(unlinking.linkId)
            }
          >
            {t("odoctor.cabinet.unlinkConfirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default OdoctorCabinetSection;
