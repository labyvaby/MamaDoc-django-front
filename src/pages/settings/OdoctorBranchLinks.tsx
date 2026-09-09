import React from "react";
import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getOdoctorBranches,
  getOdoctorCabinetBranches,
  linkOdoctorBranch,
  odoctorCabinetBranchLabel,
  odoctorCabinetBranchTaken,
  odoctorSettingsErrorMessage,
  setOdoctorBranchEnabled,
  unlinkOdoctorBranch,
} from "../../api/odoctor";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { useT } from "../../i18n/VerticalProvider";

/**
 * Какой филиал клиники какому филиалу кабинета соответствует.
 *
 * До этого номер филиала кабинета человек вводил руками в админке Django —
 * то есть мы, а не клиника, и по памяти. Номер сам по себе не подсказывает
 * ничего, а цена ошибки на уровень выше, чем у врача: в чужой календарь
 * уедут окна целого филиала.
 *
 * Кабинет свой список филиалов всё-таки отдаёт — `GET /api/v0/cabinet/`,
 * с адресами. Ручку нашли перебором 08.09.2026; в спеке до этого стояло, что
 * списка филиалов у API нет вовсе. Поэтому здесь выбор из готовых вариантов,
 * а не поле для числа.
 *
 * Связать — не значит выкладывать. Связь создаётся выключенной, и окна
 * пойдут, только когда поднят и выключатель филиала, и тумблер врача.
 */
export function OdoctorBranchLinks({
  organizationId,
  disabled,
}: {
  organizationId?: number;
  disabled?: boolean;
}) {
  const { t } = useT("settings");
  const queryClient = useQueryClient();
  const [picks, setPicks] = React.useState<Record<number, number | "">>({});
  const [error, setError] = React.useState<string | null>(null);

  const branchesQuery = useQuery({
    queryKey: djangoQueryKeys.odoctor.branches(organizationId ?? null),
    queryFn: ({ signal }) => getOdoctorBranches(signal, { organizationId }),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  // Отдельный запрос от списка своих филиалов нарочно: этот идёт в кабинет и
  // может не прийти вовсе, а таблица должна открыться и тогда — показать
  // свои филиалы и сказать, что кабинет молчит.
  const cabinetQuery = useQuery({
    queryKey: djangoQueryKeys.odoctor.cabinetBranches(organizationId ?? null),
    queryFn: ({ signal }) =>
      getOdoctorCabinetBranches(signal, { organizationId }),
    staleTime: 0,
    gcTime: 0,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: djangoQueryKeys.odoctor.branches(organizationId ?? null),
    });
    void queryClient.invalidateQueries({
      queryKey: djangoQueryKeys.odoctor.cabinetBranches(organizationId ?? null),
    });
  };

  const link = useMutation({
    mutationFn: ({
      branchId,
      odoctorBranchId,
    }: {
      branchId: number;
      odoctorBranchId: number;
    }) => linkOdoctorBranch(branchId, odoctorBranchId),
    onSuccess: (_created, input) => {
      setError(null);
      setPicks((current) => {
        const next = { ...current };
        delete next[input.branchId];
        return next;
      });
      refresh();
    },
    onError: (err) => setError(odoctorSettingsErrorMessage(err)),
  });

  const toggle = useMutation({
    mutationFn: ({
      branchId,
      isEnabled,
    }: {
      branchId: number;
      isEnabled: boolean;
    }) => setOdoctorBranchEnabled(branchId, isEnabled),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => setError(odoctorSettingsErrorMessage(err)),
  });

  const unlink = useMutation({
    mutationFn: (branchId: number) => unlinkOdoctorBranch(branchId),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => setError(odoctorSettingsErrorMessage(err)),
  });

  const busy =
    disabled || link.isPending || toggle.isPending || unlink.isPending;
  const options = cabinetQuery.data?.items ?? [];

  if (branchesQuery.isPending) {
    return (
      <Stack alignItems="center" py={3}>
        <CircularProgress size={24} />
      </Stack>
    );
  }

  return (
    <>
      <Stack spacing={1}>
        <Typography variant="subtitle1" fontWeight={600}>
          {t("odoctor.branches.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("odoctor.branches.description")}
        </Typography>
      </Stack>

      {branchesQuery.isError && (
        <Alert severity="warning">
          {odoctorSettingsErrorMessage(branchesQuery.error)}
        </Alert>
      )}

      {cabinetQuery.isError && (
        <Alert severity="warning">
          {t("odoctor.branches.cabinetSilent")}{" "}
          {odoctorSettingsErrorMessage(cabinetQuery.error)}
        </Alert>
      )}

      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {branchesQuery.data && (
        <Table size="small" sx={{ "& td, & th": { px: 1 } }}>
          <TableHead>
            <TableRow>
              <TableCell>{t("odoctor.branches.columnCrm")}</TableCell>
              <TableCell>{t("odoctor.branches.columnCabinet")}</TableCell>
              <TableCell align="center">
                {t("odoctor.branches.columnSwitch")}
              </TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {branchesQuery.data.items.map((branch) => {
              const linked = branch.odoctorBranchId !== null;
              const cabinet = options.find(
                (option) => option.odoctorBranchId === branch.odoctorBranchId,
              );
              const picked = picks[branch.branchId] ?? "";
              return (
                <TableRow key={branch.branchId}>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="body2">
                        {branch.branchName}
                      </Typography>
                      {branch.mappedDoctors > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {t("odoctor.branches.mappedDoctors", {
                            doctors: branch.mappedDoctors,
                          })}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ minWidth: 260 }}>
                    {linked ? (
                      <Typography variant="body2">
                        {cabinet
                          ? odoctorCabinetBranchLabel(cabinet)
                          : branch.odoctorBranchId}
                      </Typography>
                    ) : (
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={picked}
                        disabled={busy || options.length === 0}
                        onChange={(event) =>
                          setPicks((current) => ({
                            ...current,
                            [branch.branchId]: Number(event.target.value),
                          }))
                        }
                        label={t("odoctor.branches.pick")}
                      >
                        {options.map((option) => (
                          <MenuItem
                            key={option.odoctorBranchId}
                            value={option.odoctorBranchId}
                            disabled={odoctorCabinetBranchTaken(
                              option,
                              branch.branchId,
                            )}
                          >
                            {odoctorCabinetBranchLabel(option)}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {linked && (
                      <Switch
                        checked={branch.isEnabled}
                        disabled={busy}
                        onChange={(event) => {
                          setError(null);
                          toggle.mutate({
                            branchId: branch.branchId,
                            isEnabled: event.target.checked,
                          });
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {linked ? (
                      <Button
                        size="small"
                        color="inherit"
                        disabled={busy}
                        onClick={() => {
                          setError(null);
                          unlink.mutate(branch.branchId);
                        }}
                      >
                        {t("odoctor.branches.unlink")}
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={busy || picked === ""}
                        onClick={() => {
                          setError(null);
                          link.mutate({
                            branchId: branch.branchId,
                            odoctorBranchId: Number(picked),
                          });
                        }}
                      >
                        {t("odoctor.branches.link")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Typography variant="caption" color="text.secondary">
        {t("odoctor.branches.footnote")}
      </Typography>
    </>
  );
}

export default OdoctorBranchLinks;
