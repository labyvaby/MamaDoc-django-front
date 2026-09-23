import React from "react";
import {
  Alert,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getStaffStats, type StaffGroup } from "../../../api/reviews";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../../api/queryKeys";
import { STAFF_GROUP_META } from "../meta";
import { periodKey, type TabProps } from "./filters";

const StaffTab: React.FC<TabProps> = ({ period }) => {
  const [group, setGroup] = React.useState<StaffGroup>("doctor");
  const query = useQuery({
    queryKey: djangoQueryKeys.reviews.staff({ ...periodKey(period), group }),
    queryFn: ({ signal }) => getStaffStats({ ...period, group }, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const meta = STAFF_GROUP_META[group];
  const rows = query.data?.results ?? [];
  const columns = meta.subLabel ? 8 : 7;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={group}
          onChange={(_, v: StaffGroup | null) => v && setGroup(v)}
        >
          {(Object.keys(STAFF_GROUP_META) as StaffGroup[]).map((g) => (
            <ToggleButton key={g} value={g}>
              {STAFF_GROUP_META[g].label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {query.isFetching && <CircularProgress size={18} />}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {group === "doctor" && "Врач приёма."}
        {group === "registrar" && "Кто создал запись на приём."}
        {group === "cashier" && "Кто принял последнюю оплату за приём."}
      </Typography>
      {query.error ? (
        <Alert severity="error">
          {query.error instanceof Error ? query.error.message : "Ошибка загрузки"}
        </Alert>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Сотрудник</TableCell>
                <TableCell align="right">Отправлено</TableCell>
                <TableCell align="right">Ответили</TableCell>
                <TableCell align="right">Средняя</TableCell>
                {meta.subLabel && <TableCell align="right">{meta.subLabel}</TableCell>}
                <TableCell align="right">Негатив</TableCell>
                <TableCell align="right">5★</TableCell>
                <TableCell>Частые теги</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {query.isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" color="text.disabled">
                      Нет данных за период.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.name}</TableCell>
                    <TableCell align="right">{r.sent}</TableCell>
                    <TableCell align="right">{r.answered}</TableCell>
                    <TableCell align="right">{r.avgRating ?? "—"}</TableCell>
                    {meta.subLabel && <TableCell align="right">{r.avgSubRating ?? "—"}</TableCell>}
                    <TableCell align="right" sx={{ color: r.negative > 0 ? "error.main" : undefined, fontWeight: r.negative > 0 ? 700 : undefined }}>
                      {r.negative}
                    </TableCell>
                    <TableCell align="right">{r.promoter}</TableCell>
                    <TableCell>
                      <Stack direction="row" flexWrap="wrap" gap={0.5}>
                        {r.topTags.map((tag) => (
                          <Chip key={tag} label={tag} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
};

export default StaffTab;
