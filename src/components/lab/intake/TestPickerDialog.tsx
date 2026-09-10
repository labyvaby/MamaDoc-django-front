import React from "react";
import {
  Box,
  Dialog,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
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

/**
 * Выбор анализов из каталога — отдельным диалогом, как выбор услуги в форме
 * приёма (`ServicePickerField`).
 *
 * Раньше найденное вываливалось прямо в дровер списком карточек: четыре
 * позиции занимали пол-экрана, корзину и оплату уносило вниз, а в каталоге
 * ЛИС шесть тысяч анализов и почти любой запрос даёт длинную выдачу. Диалог
 * разводит два занятия: сначала набрать корзину, потом работать с ней.
 *
 * Диалог не закрывается по выбору: анализы почти всегда набирают пачкой, и
 * закрытие после каждого заставляло бы открывать его заново. Уже набранное
 * помечено галочкой, повторный клик убирает позицию из корзины.
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: fullScreen ? {} : { height: "min(72vh, 640px)", borderRadius: "12px" },
      }}
    >
      <Stack sx={{ height: "100%", minHeight: 0 }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ pl: 2, pr: 1, py: 1 }}
        >
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
            Анализы
          </Typography>
          <Typography variant="caption" color="text.secondary">
            выбрано {selected.length}
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Закрыть">
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>

        <Box sx={{ px: 2, pb: 1 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" color="disabled" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        <List sx={{ flex: 1, overflowY: "auto", py: 0, minHeight: 0 }}>
          {loading && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Загружаем каталог…
            </Typography>
          )}
          {!loading && tests.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Каталог анализов пуст
            </Typography>
          )}
          {!loading && tests.length > 0 && found.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Ничего не найдено
            </Typography>
          )}
          {!loading &&
            found.map((test) => {
              const picked = chosen.has(test.id);
              return (
                <ListItemButton
                  key={test.id}
                  selected={picked}
                  onClick={() => (picked ? onRemove(test.id) : onAdd(test.id))}
                  sx={{ py: 1.25, px: 2, alignItems: "flex-start", gap: 1 }}
                >
                  <ListItemText
                    primary={test.title}
                    secondary={
                      test.biomaterial ||
                      (test.requiredDay > 0 ? `${test.requiredDay} дн.` : undefined)
                    }
                    sx={{ my: 0 }}
                  />
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    noWrap
                    sx={{ flexShrink: 0, pt: 0.25 }}
                  >
                    {formatKGS(money(test.priceStandard))}
                  </Typography>
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
                  <CheckOutlined
                    fontSize="small"
                    color="primary"
                    sx={{ flexShrink: 0, mt: 0.5, opacity: picked ? 1 : 0 }}
                  />
                </ListItemButton>
              );
            })}
        </List>
      </Stack>
    </Dialog>
  );
};

export default TestPickerDialog;
