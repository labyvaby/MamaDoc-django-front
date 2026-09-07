import React from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
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
  odoctorEmployeeBlockState,
  odoctorLinkBlocker,
  odoctorSettingsErrorMessage,
  previewClearWarning,
  updateOdoctorLink,
  type OdoctorLink,
} from "../../../api/odoctor";
import { djangoQueryKeys } from "../../../api/queryKeys";

/**
 * Синхронизация окон этого врача с витриной odoctor.kg — в его же карточке.
 *
 * Стоит рядом с «Онлайн-записью» нарочно: обе решают, где врача видно
 * пациенту, и искать вторую в настройках клиники оператору незачем.
 *
 * Отличие от соседних переключателей, о котором сказано в подписи: этот
 * сохраняется **сразу**, а не вместе с формой. Он правит не поле сотрудника,
 * а отдельный объект — связь с кабинетом; притворяться полем формы значило бы
 * обещать откат по «Отмене», которого не будет.
 *
 * Связь заводит человек в админке, и здесь её не создать. Кабинет отдаёт по
 * сути одно имя врача, а цена ошибки — окна одного врача уйдут другому: в
 * этом кабинете уже встречались «Кулушова Адинай Канаатова» против
 * «Канаатовна». Поэтому без связи блок показывает подпись, а не форму.
 *
 * Включение всегда проходит через предпросмотр. День, в который CRM говорит
 * «не работает», зеркало в витрине **очищает** — у врача, чьи окна кто-то
 * ведёт руками, включение их снимет.
 */
export function OdoctorEmployeeToggle({
  employeeId,
  disabled,
}: {
  employeeId: number;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState<OdoctorLink | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const links = useQuery({
    queryKey: djangoQueryKeys.odoctor.employeeLinks(employeeId),
    queryFn: ({ signal }) => getOdoctorLinks(signal, { employeeId }),
  });

  const preview = useQuery({
    queryKey: djangoQueryKeys.odoctor.linkPreview(pending?.id ?? 0),
    queryFn: ({ signal }) => getOdoctorLinkPreview(pending!.id, signal),
    enabled: pending !== null,
    // Ходит в живой кабинет: вчерашняя витрина под видом сегодняшней здесь
    // хуже лишнего запроса.
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
        queryKey: djangoQueryKeys.odoctor.employeeLinks(employeeId),
      });
    },
    onError: (err) => setError(odoctorSettingsErrorMessage(err)),
  });

  // Пока не знаем — не мигаем блоком. На ошибке молчим: соврать оператору
  // про состояние синхронизации хуже, чем не показать её вовсе.
  if (links.isPending || links.isError) {
    return null;
  }
  const state = odoctorEmployeeBlockState(links.data);
  // Клинике без кабинета этот блок — шум.
  if (state === "hidden") {
    return null;
  }
  const rows = links.data.items;
  const warning = preview.data ? previewClearWarning(preview.data) : null;

  // Врач не сопоставлен с кабинетом. Блок всё равно показываем: иначе
  // оператор не отличит «этого врача не выкладываем» от «такой настройки
  // здесь нет». Тумблер выключен, потому что включать нечего — сопоставление
  // заводит человек в админке, и это не придирка к процессу: кабинет отдаёт
  // по сути одно имя врача, а ошибка отправит окна одного врача другому.
  if (state === "unmapped") {
    return (
      <Paper elevation={0} variant="outlined" sx={{ p: 1 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
        >
          <Stack spacing={0.25}>
            <Typography variant="body2">Витрина odoctor.kg</Typography>
            <Typography variant="caption" color="text.secondary">
              Врач не сопоставлен с врачом в кабинете odoctor — выкладывать
              нечего. Сопоставление заводит человек в админке: кабинет отдаёт
              по сути одно имя, и ошибка отправит окна одного врача другому.
            </Typography>
          </Stack>
          <Switch checked={false} disabled />
        </Stack>
      </Paper>
    );
  }

  return (
    <>
      {rows.map((link) => {
        const blocker = odoctorLinkBlocker(link);
        return (
          <Paper key={link.id} elevation={0} variant="outlined" sx={{ p: 1 }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              gap={1}
            >
              <Stack spacing={0.25}>
                <Typography variant="body2">
                  Витрина odoctor.kg{rows.length > 1 ? ` · ${link.branchName}` : ""}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Выкладывать свободные окна врача на odoctor.kg и закрывать их,
                  как только окно занято записью. Переключатель применяется
                  сразу, не по кнопке «Сохранить».
                </Typography>
                {blocker === "drift" && (
                  <Typography variant="caption" color="warning.main">
                    Кабинет переименовал врача — подтвердите ФИО в админке,
                    иначе синхронизация связь пропускает.
                  </Typography>
                )}
                {blocker === "branch-off" && (
                  <Typography variant="caption" color="text.secondary">
                    Филиал «{link.branchName}» выключен в настройках витрины —
                    пока он выключен, окна не уйдут.
                  </Typography>
                )}
              </Stack>
              <Switch
                checked={link.isEnabled}
                disabled={disabled || toggle.isPending}
                onChange={(event) => {
                  setError(null);
                  if (event.target.checked) {
                    setPending(link);
                    return;
                  }
                  toggle.mutate({ link, next: false });
                }}
              />
            </Stack>
            {error && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {error}
              </Alert>
            )}
          </Paper>
        );
      })}

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Что произойдёт при включении</DialogTitle>
        <DialogContent>
          {preview.isPending ? (
            <Stack alignItems="center" py={3} spacing={1}>
              <CircularProgress size={24} />
              <Typography variant="caption" color="text.secondary">
                Смотрим, что сейчас в витрине…
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
                  В витрине исчезнут окна за {warning.days} дн. CRM считает эти
                  дни нерабочими, а зеркало приводит витрину к расписанию CRM.
                </Alert>
              ) : (
                <Alert severity="success">
                  В витрине у врача сейчас пусто — включение только добавит
                  окна.
                </Alert>
              )}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>День</TableCell>
                    <TableCell align="right">Сейчас в витрине</TableCell>
                    <TableCell align="right">Станет по расписанию</TableCell>
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
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Отмена</Button>
          <Button
            variant="contained"
            disabled={toggle.isPending || preview.isPending}
            onClick={() =>
              pending && toggle.mutate({ link: pending, next: true })
            }
          >
            Включить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
