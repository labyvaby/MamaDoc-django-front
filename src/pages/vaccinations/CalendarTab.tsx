import React from "react";
import { Alert, Box, ButtonBase, ListItemIcon, Menu, MenuItem, Skeleton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddRounded from "@mui/icons-material/AddRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";

import type { CalendarTemplateRow } from "../../api/vaccinations";
import {
  doseAgeText,
  doseMaxAgeText,
  groupCalendarByVaccine,
} from "../../components/vaccinations/calendarTable";

type Props = {
  rows: CalendarTemplateRow[];
  loading: boolean;
  error: unknown;
  canManage: boolean;
  onEdit: (row: CalendarTemplateRow) => void;
  onDelete: (row: CalendarTemplateRow) => void;
  /** «+ доза»: новая строка с выбранной вакциной и следующим номером. */
  onAddDose: (vaccineId: number, doseNumber: number) => void;
};

/** Карточка одной дозы: номер, возраст, срок; выключенная — бледная. */
const DoseCard: React.FC<{ row: CalendarTemplateRow; onClick?: (e: React.MouseEvent<HTMLElement>) => void }> = ({
  row,
  onClick,
}) => {
  const max = doseMaxAgeText(row);
  return (
    <ButtonBase
      onClick={onClick}
      disabled={!onClick}
      sx={(th) => ({
        display: "block",
        textAlign: "left",
        minWidth: 132,
        px: 1.25,
        py: 0.75,
        borderRadius: "10px",
        border: 1,
        borderColor: row.isActive ? alpha(th.palette.primary.main, 0.35) : "divider",
        bgcolor: row.isActive ? alpha(th.palette.primary.main, 0.06) : "transparent",
        opacity: row.isActive ? 1 : 0.55,
        "&:hover": { bgcolor: alpha(th.palette.primary.main, 0.12) },
      })}
    >
      <Stack direction="row" alignItems="baseline" gap={0.75}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Доза {row.doseNumber}
        </Typography>
        {!row.mandatory && (
          <Typography variant="caption" color="text.secondary">
            · по желанию
          </Typography>
        )}
        {!row.isActive && (
          <Typography variant="caption" color="warning.main">
            · выкл.
          </Typography>
        )}
      </Stack>
      <Typography variant="body2" fontWeight={600}>
        {doseAgeText(row)}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        в срок {row.dueWindowDays} дн.{max ? ` · ${max}` : ""}
      </Typography>
    </ButtonBase>
  );
};

/**
 * Календарь прививок организации: одна строка на вакцину, дозы карточками
 * по порядку. С карточки — изменить или удалить дозу, «+ доза» — следующая.
 */
const CalendarTab: React.FC<Props> = ({ rows, loading, error, canManage, onEdit, onDelete, onAddDose }) => {
  const groups = React.useMemo(() => groupCalendarByVaccine(rows), [rows]);
  const [menu, setMenu] = React.useState<{ anchor: HTMLElement; row: CalendarTemplateRow } | null>(null);

  if (error) {
    return <Alert severity="error">{error instanceof Error ? error.message : "Ошибка загрузки"}</Alert>;
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", border: 1, borderColor: "divider", borderRadius: "12px" }}>
      {loading ? (
        <Stack spacing={1} sx={{ p: 2 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={64} />
          ))}
        </Stack>
      ) : groups.length === 0 ? (
        <Box sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">
            Календарь пуст — загрузите календарь КР или добавьте прививку
          </Typography>
        </Box>
      ) : (
        groups.map((g, i) => (
          <Box
            key={g.vaccineId}
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "220px 1fr" },
              gap: 1.5,
              alignItems: "center",
              px: 2,
              py: 1.5,
              borderTop: i === 0 ? 0 : 1,
              borderColor: "divider",
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600}>
                {g.vaccineName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {g.doses.length} {g.doses.length === 1 ? "доза" : g.doses.length < 5 ? "дозы" : "доз"} · {g.sexText}
              </Typography>
            </Box>
            <Stack direction="row" gap={1} flexWrap="wrap">
              {g.doses.map((d) => (
                <DoseCard
                  key={d.id}
                  row={d}
                  onClick={canManage ? (e) => setMenu({ anchor: e.currentTarget, row: d }) : undefined}
                />
              ))}
              {canManage && (
                <ButtonBase
                  onClick={() => onAddDose(g.vaccineId, g.nextDose)}
                  sx={{
                    minWidth: 96,
                    px: 1.25,
                    borderRadius: "10px",
                    border: 1,
                    borderStyle: "dashed",
                    borderColor: "divider",
                    color: "text.secondary",
                    gap: 0.5,
                    "&:hover": { color: "primary.main", borderColor: "primary.main" },
                  }}
                >
                  <AddRounded fontSize="small" />
                  <Typography variant="body2">доза</Typography>
                </ButtonBase>
              )}
            </Stack>
          </Box>
        ))
      )}

      <Menu anchorEl={menu?.anchor ?? null} open={menu != null} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            onEdit(menu!.row);
            setMenu(null);
          }}
        >
          <ListItemIcon>
            <EditOutlined fontSize="small" />
          </ListItemIcon>
          Изменить
        </MenuItem>
        <MenuItem
          onClick={() => {
            onDelete(menu!.row);
            setMenu(null);
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon>
            <DeleteOutlineOutlined fontSize="small" color="error" />
          </ListItemIcon>
          Удалить дозу
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default CalendarTab;
