import React from "react";
import {
  Badge,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

import SearchOutlined from "@mui/icons-material/SearchOutlined";
import ClearOutlined from "@mui/icons-material/ClearOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import CheckOutlined from "@mui/icons-material/CheckOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import CreateNewFolderOutlined from "@mui/icons-material/CreateNewFolderOutlined";
import SortOutlined from "@mui/icons-material/SortOutlined";

import { AppBottomSheet } from "../../components/ui";
import { type KnowledgeCategory } from "../../api/knowledge";
import { SORT_OPTIONS, type SortKey } from "./feedSort";

/**
 * Шапка ленты на телефоне вместо общего PageHeader. Причина: PageHeader
 * раскладывает свои элементы в ряд, и на 390px поле поиска сжималось до
 * «Пои…» между двумя кнопками, а кнопка «Статья» занимала целую строку.
 *
 * Здесь поиск получает всю ширину, разделы уезжают в горизонтальную прокрутку
 * (пять чипов вместо пяти строк чипов), а сортировка и управление папками /
 * разделами прячутся в лист под одной кнопкой. Создание статьи — плавающая
 * кнопка внизу (см. KnowledgePage).
 */
interface MobileToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  /** Идёт запрос — крутилка в поле поиска. */
  loading?: boolean;

  categories: KnowledgeCategory[];
  /** Счётчики по разделам; undefined — ещё считается. */
  categoryCounts: Map<number, number | undefined>;
  /** Всего материалов организации — счётчик чипа «Все». */
  total: number;
  categoryFilter: number | "all";
  onCategoryFilter: (value: number | "all") => void;

  sort: SortKey;
  onSortChange: (value: SortKey) => void;

  /** Папки и разделы правит только knowledge.manage. */
  canManage: boolean;
  onOpenFolders: () => void;
  onOpenCategories: () => void;
}

/** Ряд с горизонтальной прокруткой и спрятанной полосой. */
const scrollerSx = {
  display: "flex",
  gap: 0.75,
  overflowX: "auto",
  // Чипы не сжимаются: длинное название раздела уезжает за край, а не ломает ряд.
  "& > *": { flexShrink: 0 },
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
  // Прокрутка ряда не должна тянуть за собой прокрутку ленты.
  overscrollBehaviorX: "contain",
} as const;

const MobileToolbar: React.FC<MobileToolbarProps> = ({
  search,
  onSearchChange,
  loading = false,
  categories,
  categoryCounts,
  total,
  categoryFilter,
  onCategoryFilter,
  sort,
  onSortChange,
  canManage,
  onOpenFolders,
  onOpenCategories,
}) => {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <>
      <Stack direction="row" gap={1} alignItems="center">
        <TextField
          size="small"
          fullWidth
          placeholder="Поиск по материалам"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined color="action" fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {loading && <CircularProgress size={16} />}
                {!loading && search && (
                  <IconButton size="small" onClick={() => onSearchChange("")} aria-label="Очистить">
                    <ClearOutlined fontSize="small" />
                  </IconButton>
                )}
              </InputAdornment>
            ),
          }}
          sx={(t) => ({
            "& .MuiInputBase-root": {
              minHeight: t.appLayout.controls.inputHeight,
              pr: 0.5,
            },
          })}
        />
        <IconButton
          onClick={() => setSheetOpen(true)}
          aria-label="Сортировка и управление"
          sx={(t) => ({
            flexShrink: 0,
            borderRadius: "10px",
            border: `1px solid ${t.palette.divider}`,
            width: t.appLayout.controls.inputHeight,
            height: t.appLayout.controls.inputHeight,
          })}
        >
          {/* Точка на кнопке — сортировка отличается от обычной, иначе порядок
              ленты менялся бы «сам собой» без видимого следа. */}
          <Badge color="primary" variant="dot" invisible={sort === "recent"}>
            <TuneOutlined fontSize="small" />
          </Badge>
        </IconButton>
      </Stack>

      {categories.length > 0 && (
        <Box sx={scrollerSx}>
          <Chip
            size="small"
            label={total > 0 ? `Все · ${total}` : "Все"}
            color={categoryFilter === "all" ? "primary" : undefined}
            variant={categoryFilter === "all" ? "filled" : "outlined"}
            onClick={() => onCategoryFilter("all")}
            sx={{ borderRadius: "7px" }}
          />
          {categories.map((c) => {
            const count = categoryCounts.get(c.id);
            return (
              <Chip
                key={c.id}
                size="small"
                label={count === undefined ? c.name : `${c.name} · ${count}`}
                color={categoryFilter === c.id ? "primary" : undefined}
                variant={categoryFilter === c.id ? "filled" : "outlined"}
                onClick={() => onCategoryFilter(c.id)}
                sx={{ borderRadius: "7px" }}
              />
            );
          })}
        </Box>
      )}

      <AppBottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Box sx={{ px: 2, pb: 2 }}>
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
            <SortOutlined fontSize="small" sx={{ color: "text.secondary" }} />
            <Typography variant="body2" fontWeight={600}>
              Порядок
            </Typography>
            {/* Активный вариант отмечен галочкой в списке — подпись справа
                уехала бы под крестик закрытия листа. */}
          </Stack>
          <List disablePadding>
            {SORT_OPTIONS.map((o) => (
              <ListItemButton
                key={o.value}
                selected={o.value === sort}
                onClick={() => {
                  onSortChange(o.value);
                  setSheetOpen(false);
                }}
                sx={(t) => ({
                  borderRadius: "10px",
                  minHeight: 48,
                  "&.Mui-selected": { bgcolor: alpha(t.palette.primary.main, 0.08) },
                })}
              >
                <ListItemText
                  primary={o.label}
                  primaryTypographyProps={{ variant: "body2", fontWeight: o.value === sort ? 600 : 400 }}
                />
                {o.value === sort && (
                  <CheckOutlined fontSize="small" sx={{ color: "primary.onSurface" }} />
                )}
              </ListItemButton>
            ))}
          </List>

          {canManage && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <List disablePadding>
                <ListItemButton
                  onClick={() => {
                    setSheetOpen(false);
                    onOpenFolders();
                  }}
                  sx={{ borderRadius: "10px", minHeight: 48 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CreateNewFolderOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Папки" primaryTypographyProps={{ variant: "body2" }} />
                </ListItemButton>
                <ListItemButton
                  onClick={() => {
                    setSheetOpen(false);
                    onOpenCategories();
                  }}
                  sx={{ borderRadius: "10px", minHeight: 48 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CategoryOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Разделы" primaryTypographyProps={{ variant: "body2" }} />
                </ListItemButton>
              </List>
            </>
          )}
        </Box>
      </AppBottomSheet>
    </>
  );
};

export default MobileToolbar;
