import React from "react";
import {
  Box,
  IconButton,
  InputAdornment,
  Link,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

import { resolveSelectedLines, type BasketLine } from "./basketCatalog";
import type { LabTest } from "../../../api/lab";
import { formatKGS } from "../../../utility/format";
import IntakeSection from "./IntakeSection";
import TestDetailsDialog from "./TestDetailsDialog";
import TestPickerDialog from "./TestPickerDialog";

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
 * Корзина анализов: строка-приглашение открывает выбор из каталога, ниже —
 * набранное с количеством, «Экспрессом» и суммой строки.
 *
 * Выдача каталога переехала в диалог (`TestPickerDialog`): в ЛИС шесть тысяч
 * позиций, и её место — не в дровере между поиском и корзиной. В самой секции
 * остаётся только то, что регистратор набрал, — это и есть предмет разговора
 * с пациентом.
 *
 * Фильтрация каталога и склейка выбранных строк с деталями вынесены в
 * `basketCatalog.ts` и покрыты тестами там.
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
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [detailsId, setDetailsId] = React.useState<number | null>(null);

  const selectedLines = React.useMemo(
    () => resolveSelectedLines(tests, selected),
    [tests, selected],
  );

  return (
    <IntakeSection
      title="Анализы"
      loading={loading}
      action={
        selected.length > 0 ? (
          <Typography variant="caption" color="text.secondary">
            в заказе {selected.length}
          </Typography>
        ) : null
      }
    >
      <TextField
        size="small"
        fullWidth
        placeholder="Найти и добавить анализ"
        value=""
        onClick={() => {
          if (!disabled) setPickerOpen(true);
        }}
        disabled={disabled}
        inputProps={{ readOnly: true }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <SearchOutlined fontSize="small" color="disabled" />
            </InputAdornment>
          ),
        }}
        sx={{
          "& .MuiInputBase-input": { cursor: disabled ? "default" : "pointer" },
        }}
      />

      {loading ? (
        <Stack spacing={1}>
          <Skeleton variant="rounded" height={44} />
          <Skeleton variant="rounded" height={44} />
        </Stack>
      ) : selectedLines.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Анализы не выбраны — откройте каталог строкой выше
        </Typography>
      ) : (
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
          {selectedLines.map((line) => {
            const price = line.test
              ? money(line.express ? line.test.priceExpress : line.test.priceStandard)
              : 0;
            return (
              <Stack
                key={line.testId}
                direction="row"
                alignItems="center"
                gap={1}
                sx={{ py: 1 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {line.test ? (
                    <Link
                      component="button"
                      type="button"
                      underline="hover"
                      color="inherit"
                      onClick={() => setDetailsId(line.testId)}
                      sx={{
                        display: "block",
                        textAlign: "left",
                        width: "100%",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                      }}
                    >
                      {line.test.title}
                    </Link>
                  ) : (
                    <Typography variant="body2" color="error.main">
                      Тест не найден в каталоге
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {formatKGS(price)}
                    {line.count > 1 ? ` × ${line.count}` : ""}
                  </Typography>
                </Box>

                <TextField
                  size="small"
                  type="number"
                  value={line.count}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    onCountChange(
                      line.testId,
                      Number.isFinite(next) && next > 0 ? next : 1,
                    );
                  }}
                  disabled={disabled}
                  inputProps={{ min: 1, style: { width: 36, textAlign: "center" } }}
                  sx={{ ...noSpinnersSx, flexShrink: 0 }}
                />

                <Tooltip title="Экспресс — срочное исполнение по повышенной цене">
                  <Switch
                    size="small"
                    checked={line.express}
                    onChange={(event) =>
                      onExpressChange(line.testId, event.target.checked)
                    }
                    disabled={disabled}
                    inputProps={{ "aria-label": "Экспресс" }}
                  />
                </Tooltip>

                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{ flexShrink: 0, minWidth: 76, textAlign: "right" }}
                >
                  {formatKGS(price * line.count)}
                </Typography>

                <IconButton
                  size="small"
                  onClick={() => onRemove(line.testId)}
                  disabled={disabled}
                  aria-label="Убрать анализ"
                  sx={{ flexShrink: 0 }}
                >
                  <DeleteOutlined fontSize="small" />
                </IconButton>
              </Stack>
            );
          })}
        </Stack>
      )}

      <TestPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        tests={tests}
        selected={selected}
        patientGender={patientGender}
        loading={loading}
        onAdd={onAdd}
        onRemove={onRemove}
        onOpenDetails={(testId) => setDetailsId(testId)}
      />

      <TestDetailsDialog
        testId={detailsId}
        onClose={() => setDetailsId(null)}
      />
    </IntakeSection>
  );
};

export default BasketSection;
