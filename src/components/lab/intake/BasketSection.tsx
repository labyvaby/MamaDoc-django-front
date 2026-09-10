import React from "react";
import {
  Box,
  IconButton,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";

import { filterAvailableTests, resolveSelectedLines, type BasketLine } from "./basketCatalog";
import type { LabTest } from "../../../api/lab";
import { formatKGS } from "../../../utility/format";
import IntakeSection from "./IntakeSection";

type Props = {
  tests: LabTest[];
  selected: BasketLine[];
  patientGender: string;
  loading: boolean;
  disabled: boolean;
  onAdd: (testId: number) => void;
  onRemove: (testId: number) => void;
  onCountChange: (testId: number, count: number) => void;
  onExpressChange: (testId: number, express: boolean) => void;
};

function money(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Скрываем спиннеры у type=number — тот же приём, что в PaymentSection.
const noSpinnersSx = {
  "& input[type=number]": { MozAppearance: "textfield" },
  "& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
} as const;

/**
 * Корзина анализов: поиск по каталогу и список выбранного с количеством и
 * переключателем «Экспресс».
 *
 * Фильтрация каталога (пол пациента, поиск, исключение уже выбранного) и
 * склейка выбранных строк с деталями каталога вынесены в `basketCatalog.ts`
 * и покрыты тестами там — секция только рендерит результат.
 */
const BasketSection: React.FC<Props> = ({
  tests,
  selected,
  patientGender,
  loading,
  disabled,
  onAdd,
  onRemove,
  onCountChange,
  onExpressChange,
}) => {
  const [query, setQuery] = React.useState("");

  const available = React.useMemo(
    () => filterAvailableTests(tests, selected, patientGender, query),
    [tests, selected, patientGender, query],
  );
  const selectedLines = React.useMemo(() => resolveSelectedLines(tests, selected), [tests, selected]);

  return (
    <IntakeSection title="Анализы">

        <TextField
          size="small"
          fullWidth
          placeholder="Поиск по названию"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
        />

        {loading ? (
          <Stack spacing={1}>
            <Skeleton variant="rounded" height={40} />
            <Skeleton variant="rounded" height={40} />
          </Stack>
        ) : tests.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Каталог анализов пуст
          </Typography>
        ) : available.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Ничего не найдено
          </Typography>
        ) : (
          <Stack spacing={1} sx={{ maxHeight: 240, overflowY: "auto" }}>
            {available.map((test) => (
              <Stack
                key={test.id}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                gap={1}
                sx={{ p: 1, border: 1, borderColor: "divider", borderRadius: 1 }}
              >
                <Stack sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap>
                    {test.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatKGS(money(test.priceStandard))}
                  </Typography>
                </Stack>
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => onAdd(test.id)}
                  disabled={disabled}
                  aria-label="Добавить анализ"
                >
                  <AddCircleOutline fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        )}

        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            Выбрано
          </Typography>

          {selectedLines.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Добавьте анализы из списка выше
            </Typography>
          ) : (
            <Stack spacing={1}>
              {selectedLines.map((line) => (
                <Box
                  key={line.testId}
                  sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: 1 }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ minWidth: 0 }}>
                      {line.test?.title ?? "Тест не найден в каталоге"}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => onRemove(line.testId)}
                      disabled={disabled}
                      aria-label="Убрать анализ"
                    >
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  </Stack>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mt: 0.5 }}>
                    <TextField
                      size="small"
                      type="number"
                      value={line.count}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        onCountChange(line.testId, Number.isFinite(next) && next > 0 ? next : 1);
                      }}
                      disabled={disabled}
                      inputProps={{ min: 1, style: { width: 48, textAlign: "center" } }}
                      sx={noSpinnersSx}
                    />
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        Экспресс
                      </Typography>
                      <Switch
                        size="small"
                        checked={line.express}
                        onChange={(e) => onExpressChange(line.testId, e.target.checked)}
                        disabled={disabled}
                      />
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </Stack>
    </IntakeSection>
  );
};

export default BasketSection;
