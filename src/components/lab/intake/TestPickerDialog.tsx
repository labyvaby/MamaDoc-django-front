import React from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Link,
  List,
  ListItemButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { alpha, useTheme } from "@mui/material/styles";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import CheckCircle from "@mui/icons-material/CheckCircle";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

import type { LabTest } from "../../../api/lab";
import { formatKGS } from "../../../utility/format";
import { groupCatalog, type CatalogGroup } from "./basketCatalog";
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
 * Каталог показан категориями дерева ЛИС, как в её собственном интерфейсе:
 * без поиска группы свёрнуты и раскрываются по клику, с поиском остаются
 * только группы с совпадениями и раскрыты все. Поиск ищет и по названию
 * категории — набравший «аллерг» получает весь раздел.
 *
 * Ветеринария отделена: в каталоге ЛИС она живёт под своим корнем, и в
 * детской клинике её место не в общей выдаче. Показывается переключателем,
 * а если поиск нашёл что-то только там — подсказкой со счётчиком.
 *
 * Диалог не закрывается по выбору: анализы почти всегда набирают пачкой.
 * Взятое помечено галочкой, повторный клик убирает позицию; закончив,
 * регистратор нажимает «Готово» в подвале.
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
  const [showVeterinary, setShowVeterinary] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (open) {
      setSearch("");
      setExpanded(new Set());
    }
  }, [open]);

  const chosen = React.useMemo(
    () => new Set(selected.map((line) => line.testId)),
    [selected],
  );

  const groups = React.useMemo(
    () => groupCatalog(tests, patientGender, search),
    [tests, patientGender, search],
  );
  const searching = search.trim().length > 0;
  const visible = groups.filter((group) => showVeterinary || !group.veterinary);
  const hiddenVet = groups
    .filter((group) => group.veterinary)
    .reduce((sum, group) => sum + group.tests.length, 0);

  const toggleGroup = (key: string) =>
    setExpanded((was) => {
      const next = new Set(was);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const hint = loading
    ? "Загружаем каталог…"
    : tests.length === 0
      ? "Каталог анализов пуст"
      : visible.length === 0
        ? "Ничего не найдено"
        : null;

  const renderTest = (test: LabTest) => {
    const picked = chosen.has(test.id);
    const express = money(test.priceExpress);
    const standard = money(test.priceStandard);
    const secondary = subtitle(test);
    return (
      <ListItemButton
        key={test.id}
        onClick={() => (picked ? onRemove(test.id) : onAdd(test.id))}
        sx={{
          py: 1,
          pl: 4.5,
          pr: 2.5,
          gap: 1.5,
          alignItems: "center",
          bgcolor: picked
            ? alpha(theme.palette.primary.main, 0.06)
            : "transparent",
        }}
      >
        {picked ? (
          <CheckCircle fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
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

        <Stack alignItems="flex-end" sx={{ flexShrink: 0, minWidth: 104 }}>
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
  };

  const renderGroup = (group: CatalogGroup) => {
    const isOpen = searching || expanded.has(group.key);
    const pickedHere = group.tests.filter((test) => chosen.has(test.id)).length;
    return (
      <React.Fragment key={group.key}>
        <ListItemButton
          onClick={() => !searching && toggleGroup(group.key)}
          sx={{
            py: 1,
            px: 2.5,
            gap: 1,
            bgcolor: "background.default",
            borderTop: 1,
            borderBottom: isOpen ? 1 : 0,
            borderColor: "divider",
            cursor: searching ? "default" : "pointer",
          }}
        >
          {!searching && (
            <ExpandMoreIcon
              fontSize="small"
              sx={{
                color: "action.active",
                transition: "transform .2s",
                transform: isOpen ? "rotate(180deg)" : "rotate(-90deg)",
              }}
            />
          )}
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{ flex: 1, minWidth: 0 }}
            noWrap
          >
            {group.title}
          </Typography>
          {pickedHere > 0 && (
            <Chip size="small" color="primary" label={`взято ${pickedHere}`} />
          )}
          <Typography variant="caption" color="text.secondary">
            {group.tests.length}
          </Typography>
        </ListItemButton>
        {isOpen && group.tests.map(renderTest)}
      </React.Fragment>
    );
  };

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

        <Stack
          direction="row"
          alignItems="center"
          gap={1.5}
          sx={{ px: 2.5, pb: 1.5 }}
        >
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Название анализа, его код или раздел"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" color="disabled" />
                </InputAdornment>
              ),
              sx: { borderRadius: "10px" },
            }}
          />
          <FormControlLabel
            sx={{ m: 0, flexShrink: 0 }}
            control={
              <Switch
                size="small"
                checked={showVeterinary}
                onChange={(event) => setShowVeterinary(event.target.checked)}
              />
            }
            label={
              <Typography variant="body2" color="text.secondary">
                Ветеринария
              </Typography>
            }
          />
        </Stack>

        <Divider />

        {hint ? (
          <Stack spacing={1} sx={{ p: 2.5, flex: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {hint}
            </Typography>
            {!showVeterinary && hiddenVet > 0 && (
              <Typography variant="body2" color="text.secondary">
                В ветеринарном разделе совпадений: {hiddenVet}.{" "}
                <Link
                  component="button"
                  type="button"
                  onClick={() => setShowVeterinary(true)}
                >
                  Показать
                </Link>
              </Typography>
            )}
          </Stack>
        ) : (
          <List sx={{ flex: 1, overflowY: "auto", py: 0, minHeight: 0 }}>
            {visible.map(renderGroup)}
            {!showVeterinary && hiddenVet > 0 && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", px: 2.5, py: 1.5 }}
              >
                Ещё {hiddenVet} в ветеринарном разделе — включите переключатель
                сверху, чтобы увидеть.
              </Typography>
            )}
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
