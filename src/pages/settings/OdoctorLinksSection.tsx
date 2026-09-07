import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getOdoctorLinkPreview,
  getOdoctorLinks,
  odoctorLinkBlocker,
  odoctorSettingsErrorMessage,
  previewClearWarning,
  updateOdoctorLink,
  type OdoctorLink,
} from "../../api/odoctor";
import { djangoQueryKeys } from "../../api/queryKeys";
import { useT } from "../../i18n/VerticalProvider";

/**
 * Врачи, зеркалящие свои окна в витрину odoctor.kg.
 *
 * Раздел существует потому, что включатель врача жил только в админке Django,
 * и оператор с правом `odoctor.manage` до него не доставал.
 *
 * Сопоставление врача с кабинетом здесь сознательно НЕ делается — только
 * тумблер. Номер врача и снимок ФИО правятся в админке: за ними стоит решение
 * «чьи окна куда уходят», кабинет отдаёт по сути одно имя, и в этом кабинете
 * уже встречались «Кулушова Адинай Канаатова» против «Канаатовна».
 *
 * Включение всегда проходит через предпросмотр, и это не вежливость. День, в
 * который CRM говорит «не работает», зеркало в витрине **очищает**. У врача,
 * чьи окна кто-то ведёт руками, включение их снимет — без таблицы оператор
 * вычистил бы витрину, не поняв, что сделал. Выключение спрашивать не о чем:
 * оно ничего не отправляет.
 */
export function OdoctorLinksSection({
  organizationId,
}: {
  organizationId: number | null;
}) {
  const { t } = useT("settings");
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState<OdoctorLink | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const links = useQuery({
    queryKey: djangoQueryKeys.odoctor.links(organizationId),
    queryFn: ({ signal }) => getOdoctorLinks(signal, { organizationId }),
  });

  const preview = useQuery({
    queryKey: djangoQueryKeys.odoctor.linkPreview(pending?.id ?? 0),
    queryFn: ({ signal }) => getOdoctorLinkPreview(pending!.id, signal),
    enabled: pending !== null,
    // Ходит в кабинет odoctor: показать вчерашнюю витрину как сегодняшнюю
    // здесь хуже, чем подождать лишний запрос.
    staleTime: 0,
    gcTime: 0,
  });

  const toggle = useMutation({
    mutationFn: ({ link, next }: { link: OdoctorLink; next: boolean }) =>
      updateOdoctorLink(link.id, next),
    onSuccess: () => {
      setError(null);
      setPending(null);
      void queryClient.invalidateQueries({
        queryKey: djangoQueryKeys.odoctor.links(organizationId),
      });
    },
    onError: (err) => setError(odoctorSettingsErrorMessage(err)),
  });

  const onSwitch = (link: OdoctorLink, next: boolean) => {
    setError(null);
    if (next) {
      setPending(link);
      return;
    }
    toggle.mutate({ link, next: false });
  };

  const warning = preview.data ? previewClearWarning(preview.data) : null;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="subtitle2" fontWeight={600}>
          {t("odoctor.doctorsTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("odoctor.doctorsDescription")}
        </Typography>
      </Box>

      {error && <Alert severity="warning">{error}</Alert>}

      {links.isPending ? (
        <Stack alignItems="center" py={3}>
          <CircularProgress size={24} />
        </Stack>
      ) : links.data && links.data.items.length > 0 ? (
        <Stack divider={<Box borderBottom={1} borderColor="divider" />}>
          {links.data.items.map((link) => {
            const blocker = odoctorLinkBlocker(link);
            return (
              <Stack
                key={link.id}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={2}
                py={1.5}
              >
                <Box minWidth={0}>
                  <Typography variant="body2" fontWeight={500} noWrap>
                    {link.employeeName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {link.branchName} ·{" "}
                    {t("odoctor.doctorsCabinet", {
                      id: link.odoctorDoctorId,
                    })}
                  </Typography>
                </Box>
                <Stack direction="row" alignItems="center" spacing={1}>
                  {blocker === "drift" && (
                    <Chip
                      size="small"
                      color="warning"
                      label={t("odoctor.blockerDrift")}
                    />
                  )}
                  {blocker === "branch-off" && (
                    <Chip size="small" label={t("odoctor.blockerBranchOff")} />
                  )}
                  <Switch
                    checked={link.isEnabled}
                    disabled={toggle.isPending}
                    onChange={(event) =>
                      onSwitch(link, event.target.checked)
                    }
                  />
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      ) : (
        <Alert severity="info">{t("odoctor.doctorsEmpty")}</Alert>
      )}

      <Typography variant="caption" color="text.secondary">
        {t("odoctor.toggleOffHint")}
      </Typography>

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t("odoctor.previewTitle")}</DialogTitle>
        <DialogContent>
          {preview.isPending ? (
            <Stack alignItems="center" py={3} spacing={1}>
              <CircularProgress size={24} />
              <Typography variant="caption" color="text.secondary">
                {t("odoctor.previewLoading")}
              </Typography>
            </Stack>
          ) : preview.isError ? (
            <Alert severity="warning">
              {odoctorSettingsErrorMessage(preview.error)}
            </Alert>
          ) : (
            <Stack spacing={2}>
              {warning ? (
                <Alert severity="warning">
                  {t("odoctor.previewWarning", { days: warning.days })}
                </Alert>
              ) : (
                <Alert severity="success">{t("odoctor.previewSafe")}</Alert>
              )}
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t("odoctor.previewColumnDate")}</TableCell>
                      <TableCell align="right">
                        {t("odoctor.previewColumnCabinet")}
                      </TableCell>
                      <TableCell align="right">
                        {t("odoctor.previewColumnOffer")}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.data?.days.map((day) => (
                      <TableRow key={day.date}>
                        <TableCell>{day.date}</TableCell>
                        <TableCell align="right">{day.inCabinet}</TableCell>
                        <TableCell align="right">{day.wouldOffer}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>
            {t("odoctor.previewCancel")}
          </Button>
          <Button
            variant="contained"
            disabled={toggle.isPending || preview.isPending}
            onClick={() =>
              pending && toggle.mutate({ link: pending, next: true })
            }
          >
            {t("odoctor.previewConfirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
