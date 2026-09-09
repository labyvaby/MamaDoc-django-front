import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import ExpandLessOutlined from "@mui/icons-material/ExpandLessOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import dayjs from "dayjs";

import { getConclusionRevisions } from "../../api/medical";
import { getAllDjangoEmployees } from "../../api/staff";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { buildRevisionHistory, type RevisionEntry } from "../../utility/conclusionRevisions";

/**
 * История правок заключения.
 *
 * Зачем. Бэк версионирует заключение с самого начала, но показать историю было
 * негде: `getConclusionRevisions` не вызывался ниоткуда. На вопрос «кто и когда
 * переписал заключение» ответа не было, хотя ответ лежал в базе — для
 * медицинской записи это первое, что спрашивают при разборе.
 *
 * Грузим по требованию, а не при каждом открытии заключения: история нужна
 * редко, а запрос на каждый просмотр карточки — лишняя нагрузка на список
 * приёмов.
 *
 * Отката ревизии здесь нет намеренно: восстановление должно возвращать текст и
 * бланк вместе и переписывать текущую запись — это отдельное решение с
 * последствиями, а не кнопка рядом со списком.
 */
const REASON_LABELS: Record<RevisionEntry["changeReason"], string> = {
  create: "Создано",
  update: "Изменено",
  complete: "Завершено",
};

/**
 * Длинные значения показываем свёрнутыми. Собранный бланком текст — это
 * полстраницы протокола, и в истории он выводился дважды (было и стало),
 * из-за чего одна правка занимала весь экран и читать её было нельзя.
 */
const CLAMP_CHARS = 180;

const ChangeValue: React.FC<{ value: string; struck?: boolean }> = ({ value, struck }) => {
  const [expanded, setExpanded] = React.useState(false);
  const long = value.length > CLAMP_CHARS;
  const shown = long && !expanded ? `${value.slice(0, CLAMP_CHARS).trimEnd()}…` : value;

  return (
    <Box>
      <Typography
        variant="body2"
        color={struck ? "text.disabled" : "text.primary"}
        sx={{
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          textDecoration: struck ? "line-through" : "none",
        }}
      >
        {shown}
      </Typography>
      {long && (
        <Button size="small" sx={{ px: 0, minWidth: 0 }} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "свернуть" : "показать полностью"}
        </Button>
      )}
    </Box>
  );
};

const ChangeRow: React.FC<{ change: RevisionEntry["changes"][number] }> = ({ change }) => (
  <Box sx={{ mt: 0.75 }}>
    <Typography variant="body2" fontWeight={600}>
      {change.label}
    </Typography>
    {change.before && <ChangeValue value={change.before} struck />}
    {change.after ? (
      <ChangeValue value={change.after} />
    ) : (
      <Typography variant="body2" color="text.disabled">
        очищено
      </Typography>
    )}
  </Box>
);

export const ConclusionHistory: React.FC<{ conclusionId: number }> = ({ conclusionId }) => {
  const [open, setOpen] = React.useState(false);
  const orgId = useApiOrgId();

  const query = useQuery({
    queryKey: ["django", "conclusion", conclusionId, "revisions"] as const,
    queryFn: ({ signal }) => getConclusionRevisions(conclusionId, signal),
    enabled: open,
    retry: false,
  });

  /**
   * ФИО автора правки. Бэк отдаёт только `changedById` (id пользователя), а имя
   * приходится добирать справочником сотрудников по `authUserId` — тот же
   * матчинг, что и в списке доступов. Справочник кэшируется react-query, так
   * что на историю он грузится один раз за сессию.
   */
  const staffQuery = useQuery({
    queryKey: ["django", "staff", "all", orgId ?? null] as const,
    queryFn: ({ signal }) => getAllDjangoEmployees({ organizationId: orgId }, signal),
    enabled: open,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const nameByUserId = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const employee of staffQuery.data ?? []) {
      if (employee.authUserId != null) map.set(employee.authUserId, employee.fullName);
    }
    return map;
  }, [staffQuery.data]);

  const entries = React.useMemo(
    () => buildRevisionHistory(query.data ?? []),
    [query.data],
  );

  return (
    <Box>
      <Button
        size="small"
        color="inherit"
        onClick={() => setOpen((prev) => !prev)}
        startIcon={<HistoryOutlined fontSize="small" />}
        endIcon={open ? <ExpandLessOutlined /> : <ExpandMoreOutlined />}
        sx={{ alignSelf: "flex-start", color: "text.secondary", fontWeight: 600 }}
      >
        История изменений
      </Button>

      <Collapse in={open} unmountOnExit>
        {query.isLoading && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">
              Загружаем историю…
            </Typography>
          </Stack>
        )}

        {query.isError && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            Не удалось загрузить историю изменений.
          </Alert>
        )}

        {query.isSuccess && entries.length === 0 && (
          <Typography variant="body2" color="text.disabled" sx={{ py: 1 }}>
            Правок не было.
          </Typography>
        )}

        <Stack spacing={1} sx={{ mt: 1 }}>
          {entries.map((entry) => (
            <Paper key={entry.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip size="small" label={REASON_LABELS[entry.changeReason]} />
                <Typography variant="caption" color="text.secondary">
                  {[
                    entry.changedById != null ? nameByUserId.get(entry.changedById) : null,
                    dayjs(entry.createdAt).format("DD.MM.YYYY HH:mm"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              </Stack>

              {entry.changes.length === 0 ? (
                <Typography variant="body2" color="text.disabled" sx={{ mt: 0.75 }}>
                  Поля заключения не менялись.
                </Typography>
              ) : (
                entry.changes.map((change) => <ChangeRow key={change.field} change={change} />)
              )}
            </Paper>
          ))}
        </Stack>

        {query.isSuccess && entries.length > 0 && (
          // Честно говорим о границе контракта: показатели бэк не версионирует,
          // и их правки в этой истории не появятся.
          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
            Рост, вес и температура в историю правок не попадают.
          </Typography>
        )}
      </Collapse>
    </Box>
  );
};

export default ConclusionHistory;
