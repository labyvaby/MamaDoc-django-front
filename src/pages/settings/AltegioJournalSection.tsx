import React from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { getAltegioJournal } from "../../api/altegio";
import { parseBackendError } from "../../api/appointments";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { useT } from "../../i18n/VerticalProvider";

type Props = { organizationId: number | undefined };

export const AltegioJournalSection: React.FC<Props> = ({ organizationId }) => {
  const { t } = useT("settings");
  const journalQuery = useQuery({
    queryKey: djangoQueryKeys.altegio.journal(organizationId),
    queryFn: ({ signal }) => getAltegioJournal(signal, { organizationId }),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const items = journalQuery.data?.items ?? [];

  return (
    <Stack spacing={1}>
      <Box>
        <Typography variant="subtitle1" fontWeight={600}>
          {t("altegio.journalTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("altegio.journalDescription")}
        </Typography>
      </Box>
      {journalQuery.isLoading && <CircularProgress size={20} />}
      {journalQuery.isError && <Alert severity="error">{parseBackendError(journalQuery.error)}</Alert>}
      {journalQuery.isSuccess && items.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t("altegio.journalEmpty")}
        </Typography>
      )}
      {items.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t("altegio.journalColumns.startsAt")}</TableCell>
              <TableCell>{t("altegio.journalColumns.staff")}</TableCell>
              <TableCell>{t("altegio.journalColumns.client")}</TableCell>
              <TableCell>{t("altegio.journalColumns.state")}</TableCell>
              <TableCell>{t("altegio.journalColumns.note")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.recordId}>
                <TableCell>{item.startsAt ? new Date(item.startsAt).toLocaleString("ru-RU") : "—"}</TableCell>
                <TableCell>{item.staffName || "—"}</TableCell>
                <TableCell>{item.clientName || "—"}</TableCell>
                <TableCell>{t(`altegio.journalStates.${item.state}`)}</TableCell>
                <TableCell>{item.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Stack>
  );
};
