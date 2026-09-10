import React from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { alpha, useTheme } from "@mui/material/styles";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import CheckCircle from "@mui/icons-material/CheckCircle";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

import type { LabTest } from "../../../api/lab";
import { formatKGS } from "../../../utility/format";
import { filterAvailableTests } from "./basketCatalog";
import type { BasketLine } from "./basketCatalog";

interface Props {
  open: boolean;
  onClose: () => void;
  tests: LabTest[];
  selected: BasketLine[];
  patientGender: string;
  loading: boolean;
  onAdd: (testId: number) => void;
  onRemove: (testId: number) => void;
  /** Открыть карточку анализа поверх выбора. */
  onOpenDetails: (testId: number) => void;
}

function money(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Срок и биоматериал одной строкой — вторичная строка названия. */
function subtitle(test: LabTest): string {
  const parts = [test.biomaterial.trim()].filter(Boolean);
  if (test.requiredDay > 0) parts.push(`${test.requiredDay} дн.`);
  return parts.join(" · ");
}

/**
 * Выбор анализов из каталога — отдельным диалогом, как выбор услуги в форме
 * записи (`ServicePickerField`).
 *
 * Раньше найденное вываливалось прямо в дровер списком карточек: четыре
 * позиции занимали пол-экрана, корзину и оплату уносило вниз, а в каталоге
 * ЛИС шесть тысяч анализов и почти любой запрос даёт длинную выдачу. Диалог
 * разводит два занятия: сначала набрать корзину, потом работать с ней.
 *
 * Диалог не закрывается по выбору: анализы почти всегда набирают пачкой, и
 * закрытие после каждого заставляло бы открывать его заново. Взятое помечено
 * галочкой, повторный клик убирает позицию; закончив, регистратор нажимает
 * «Готово» в подвале — единственную кнопку диалога, поэтому она и заметна.
 *
 * Названия в каталоге ЛИС длинные, с кодом и уточнениями в скобках, поэтому
 * им отданы две строки с обрезкой, а цена стоит в колонке фиксированной
 * ширины: иначе она гуляла бы по строкам и её нельзя было бы сравнивать
 * взглядом сверху вниз.
 */
const TestPickerDialog: React.FC<Props> = ({
  open,
  onClose,
  tests,
  selected,
  patientGender,
  loading,
  onAdd,
  onRemove,
  onOpenDetails,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const chosen = React.useMemo(
    () => new Set(selected.map((line) => line.testId)),
    [selected],
  );

  /**
   * Уже выбранное из выдачи не вычёркиваем (пустой список `selected`): иначе
   * строка исчезала бы под курсором сразу после клика, и было бы неясно,
   * добавилась она или потерялась. Вместо этого она остаётся с галочкой.
   */
  const found = React.useMemo(
    () => filterAvailableTests(tests, [], patientGender, search),
    [tests, patientGender, search],
  );

  const hint = loading
    ? "Загружаем каталог…"
    : tests.length === 0
      ? "Каталог анализов пуст"
      : found.length === 0
        ? "Ничего не найдено"
        : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: fullScreen
          ? {}
          : { height: "min(78vh, 720px)", borderRadius: "14px" },
      }}
    >
      <Stack sx={{ height: "100%", minHeight: 0 }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ pl: 2.5, pr: 1.5, py: 1.5 }}
        >
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
            Каталог анализов
          </Typography>
          {selected.length > 0 && (
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={`в заказе ${selected.length}`}
            />
          )}
          <IconButton size="small" onClick={onClose} aria-label="Закрыть">
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>

        <Box sx={{ px: 2.5, pb: 1.5 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Название анализа или его код"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" color="disabled" />
                </InputAdornment>
              ),
              sx: { borderRadius: "10px" },
            }}
          />
        </Box>

        <Divider />

        {hint ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ p: 2.5, flex: 1 }}
          >
            {hint}
          </Typography>
        ) : (
          <List
            sx={{
              flex: 1,
              overflowY: "auto",
              py: 0,
              minHeight: 0,
              "& .MuiListItemButton-root + .MuiListItemButton-root": {
                borderTop: 1,
                borderColor: "divider",
              },
            }}
          >
            {found.map((test) => {
              const picked = chosen.has(test.id);
              const express = money(test.priceExpress);
              const standard = money(test.priceStandard);
              const secondary = subtitle(test);
              return (
                <ListItemButton
                  key={test.id}
                  onClick={() => (picked ? onRemove(test.id) : onAdd(test.id))}
                  sx={{
                    py: 1.25,
                    px: 2.5,
                    gap: 1.5,
                    alignItems: "center",
                    bgcolor: picked
                      ? alpha(theme.palette.primary.main, 0.06)
                      : "transparent",
                  }}
                >
                  {picked ? (
                    <CheckCircle
                      fontSize="small"
                      color="primary"
                      sx={{ flexShrink: 0 }}
                    />
                  ) : (
                    <AddCircleOutline
                      fontSize="small"
                      sx={{ flexShrink: 0, color: "action.active" }}
                    />
                  )}

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      fontWeight={picked ? 600 : 500}
                      sx={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {test.title}
                    </Typography>
                    {secondary && (
                      <Typography variant="caption" color="text.secondary">
                        {secondary}
                      </Typography>
                    )}
                  </Box>

                  <Stack
                    alignItems="flex-end"
                    sx={{ flexShrink: 0, minWidth: 104 }}
                  >
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {formatKGS(standard)}
                    </Typography>
                    {express > 0 && express !== standard && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        экспресс {formatKGS(express)}
                      </Typography>
                    )}
                  </Stack>

                  <Tooltip title="Подробнее об анализе">
                    <IconButton
                      size="small"
                      aria-label="Подробнее об анализе"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenDetails(test.id);
                      }}
                      sx={{ flexShrink: 0 }}
                    >
                      <InfoOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              );
            })}
          </List>
        )}

        <Divider />

        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
          sx={{ px: 2.5, py: 1.5 }}
        >
          <Typography variant="caption" color="text.secondary">
            {selected.length === 0
              ? "Ничего не выбрано"
              : `Выбрано анализов: ${selected.length}`}
          </Typography>
          <Button variant="contained" size="small" onClick={onClose}>
            Готово
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  );
};

export default TestPickerDialog;
