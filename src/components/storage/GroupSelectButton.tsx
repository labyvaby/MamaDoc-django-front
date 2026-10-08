import React from "react";
import {
  Box,
  Checkbox,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import LibraryAddCheckOutlined from "@mui/icons-material/LibraryAddCheckOutlined";
import SearchIcon from "@mui/icons-material/SearchOutlined";
import { SegmentedTabs } from "../ui";
import {
  PRODUCT_GROUP_LABELS,
  buildProductGroups,
  toggleGroup,
  type GroupableItem,
  type ProductGroupKind,
} from "../../utility/productGroups";

interface GroupSelectButtonProps {
  /** Строки, которые сейчас видны в списке: группа берётся из них. */
  items: readonly GroupableItem[];
  checkedIds: ReadonlySet<number>;
  onCheckedChange: (next: Set<number>) => void;
  disabled?: boolean;
  /** Уникален на страницу — для подвижного фона вкладок. */
  layoutId: string;
}

/**
 * «Выбрать группой»: категория, бренд или сезон отмечаются в списке разом,
 * дальше с ними работают обычные массовые действия. Повторный клик по
 * выбранной целиком группе снимает её.
 */
export const GroupSelectButton: React.FC<GroupSelectButtonProps> = ({
  items,
  checkedIds,
  onCheckedChange,
  disabled = false,
  layoutId,
}) => {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const [query, setQuery] = React.useState("");
  const groups = React.useMemo(() => buildProductGroups(items), [items]);
  const kinds = (Object.keys(PRODUCT_GROUP_LABELS) as ProductGroupKind[]).filter((k) => groups[k].length > 0);
  const [kind, setKind] = React.useState<ProductGroupKind>("category");
  const activeKind = kinds.includes(kind) ? kind : kinds[0];

  const q = query.trim().toLowerCase();
  const shown = activeKind ? groups[activeKind].filter((g) => !q || g.key.includes(q)) : [];

  return (
    <>
      <Tooltip title="Выбрать группой: категория, бренд, сезон">
        <span>
          <IconButton
            size="small"
            disabled={disabled || kinds.length === 0}
            onClick={(e) => setAnchor(e.currentTarget)}
            aria-label="Выбрать группой"
            sx={{ color: "text.secondary" }}
          >
            <LibraryAddCheckOutlined fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => {
          setAnchor(null);
          setQuery("");
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: "calc(100vw - 32px)" } } }}
      >
        <Box sx={{ p: 1.5, pb: 1, display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Выбрать группой
          </Typography>
          {kinds.length > 1 && activeKind && (
            <SegmentedTabs
              layoutId={layoutId}
              value={activeKind}
              onChange={setKind}
              tabs={kinds.map((k) => ({ key: k, label: PRODUCT_GROUP_LABELS[k], badge: groups[k].length }))}
            />
          )}
          <TextField
            size="small"
            autoFocus
            placeholder="Найти"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>
        <List dense disablePadding sx={{ maxHeight: 320, overflowY: "auto", pb: 0.5 }}>
          {shown.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
              Ничего не найдено
            </Typography>
          )}
          {shown.map((g) => {
            const picked = g.ids.filter((id) => checkedIds.has(id)).length;
            const all = picked === g.ids.length;
            return (
              <ListItemButton
                key={g.key}
                disabled={disabled}
                onClick={() => onCheckedChange(toggleGroup(checkedIds, g.ids))}
                sx={{ py: 0.25 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Checkbox
                    size="small"
                    edge="start"
                    tabIndex={-1}
                    disableRipple
                    checked={all}
                    indeterminate={picked > 0 && !all}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={g.label}
                  primaryTypographyProps={{ variant: "body2", noWrap: true }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1, flexShrink: 0 }}>
                  {picked > 0 && !all ? `${picked} из ${g.ids.length}` : g.ids.length}
                </Typography>
              </ListItemButton>
            );
          })}
        </List>
      </Popover>
    </>
  );
};
