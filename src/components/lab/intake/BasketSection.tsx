import React from "react";
import {
  Box,
  IconButton,
  InputAdornment,
  Link,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import BoltOutlined from "@mui/icons-material/BoltOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

import { resolveSelectedLines, stepCount, type BasketLine } from "./basketCatalog";
import type { LabTest } from "../../../api/lab";
import { formatKGS } from "../../../utility/format";
import IntakeSection from "./IntakeSection";
import PreparationPopover from "./PreparationPopover";
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
                </Box>

                {line.test?.hasPreparation && (
                  <PreparationPopover testId={line.testId} title={line.test.title} />
                )}

                <Stack
                  direction="row"
                  alignItems="center"
                  sx={{
                    flexShrink: 0,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    overflow: "hidden",
                  }}
                >
                  <IconButton
                    size="small"
                    disabled={disabled || line.count <= 1}
                    onClick={() =>
                      onCountChange(line.testId, stepCount(line.count, -1))
                    }
                    aria-label="Меньше на один"
                    sx={{ borderRadius: 0 }}
                  >
                    <RemoveOutlined fontSize="small" />
                  </IconButton>
                  <Typography
                    variant="body2"
                    sx={{ width: 28, textAlign: "center", userSelect: "none" }}
                  >
                    {line.count}
                  </Typography>
                  <IconButton
                    size="small"
                    disabled={disabled}
                    onClick={() =>
                      onCountChange(line.testId, stepCount(line.count, +1))
                    }
                    aria-label="Больше на один"
                    sx={{ borderRadius: 0 }}
                  >
                    <AddOutlined fontSize="small" />
                  </IconButton>
                </Stack>

                <Tooltip title="Срочное исполнение по повышенной цене">
                  <ToggleButton
                    value="express"
                    size="small"
                    selected={line.express}
                    disabled={disabled}
                    onChange={() => onExpressChange(line.testId, !line.express)}
                    sx={{
                      flexShrink: 0,
                      px: 1,
                      py: 0.25,
                      gap: 0.5,
                      textTransform: "none",
                      lineHeight: 1.2,
                    }}
                  >
                    <BoltOutlined sx={{ fontSize: 16 }} />
                    <Typography variant="caption" fontWeight={600}>
                      Экспресс
                    </Typography>
                  </ToggleButton>
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
