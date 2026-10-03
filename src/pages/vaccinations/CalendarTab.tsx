import React from "react";
import {
  Alert,
  Box,
  ButtonBase,
  ListItemIcon,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddRounded from "@mui/icons-material/AddRounded";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";

import type { CalendarTemplateRow } from "../../api/vaccinations";
import {
  ageColumns,
  doseAgeText,
  doseMaxAgeText,
  dosesAt,
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

const NAME_COL = 200;
const AGE_COL = 84;
const ADD_COL = 40;
const ROW_H = 38;
const LINE = 2;

/** Подсказка дозы: всё, что в капсулу не помещается. */
function doseTooltip(d: CalendarTemplateRow): string {
  const parts = [
    `${d.vaccineName}, доза ${d.doseNumber} — ${doseAgeText(d).toLowerCase()}`,
    `в срок ${d.dueWindowDays} дн.`,
  ];
  const max = doseMaxAgeText(d);
  if (max) parts.push(`назначается ${max}`);
  if (d.sex === "female") parts.push("только девочкам");
  if (d.sex === "male") parts.push("только мальчикам");
  if (!d.mandatory) parts.push("по желанию");
  if (!d.isActive) parts.push("выключена");
  return parts.join(" · ");
}

/**
 * Доза — «станция» на линии вакцины: кружок с номером и срок «в срок» рядом.
 * Сплошной — обязательная, пунктир — по желанию, бледная — выключена.
 * Фон капсулы непрозрачный: линия серии проходит под ней.
 */
const DoseStop: React.FC<{ d: CalendarTemplateRow; onClick?: (e: React.MouseEvent<HTMLElement>) => void }> = ({
  d,
  onClick,
}) => {
  const theme = useTheme();
  const main = theme.palette.primary.main;
  return (
    <Tooltip title={doseTooltip(d)} arrow placement="top" disableInteractive>
      <ButtonBase
        onClick={onClick}
        disableRipple={!onClick}
        aria-label={doseTooltip(d)}
        sx={{
          position: "relative",
          zIndex: 1,
          gap: 0.5,
          pl: 0.25,
          pr: 0.75,
          height: 24,
          borderRadius: "12px",
          bgcolor: "background.paper",
          border: 1,
          borderColor: alpha(main, d.isActive ? 0.45 : 0.2),
          opacity: d.isActive ? 1 : 0.45,
          cursor: onClick ? "pointer" : "default",
          transition: "border-color .15s ease, box-shadow .15s ease",
          "&:hover": onClick ? { borderColor: main, boxShadow: `0 0 0 3px ${alpha(main, 0.15)}` } : undefined,
        }}
      >
        <Box
          component="span"
          sx={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 11,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            color: d.mandatory ? theme.palette.primary.contrastText : main,
            bgcolor: d.mandatory ? main : "transparent",
            border: d.mandatory ? "none" : `1.5px dashed ${main}`,
          }}
        >
          {d.doseNumber}
        </Box>
        <Box
          component="span"
          sx={{ fontSize: 11, lineHeight: 1, color: "text.secondary", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
        >
          {d.dueWindowDays} дн.
        </Box>
      </ButtonBase>
    </Tooltip>
  );
};

/**
 * Календарь прививок организации — «схема линий»: строка — вакцина, колонка —
 * возраст, капсулы — дозы, линия связывает дозы одной серии. Капсула открывает
 * «Изменить / Удалить», «+» в конце строки — следующая доза.
 */
const CalendarTab: React.FC<Props> = ({ rows, loading, error, canManage, onEdit, onDelete, onAddDose }) => {
  const theme = useTheme();
  const main = theme.palette.primary.main;
  const groups = React.useMemo(() => groupCalendarByVaccine(rows), [rows]);
  const columns = React.useMemo(() => ageColumns(rows), [rows]);
  const [menu, setMenu] = React.useState<{ anchor: HTMLElement; row: CalendarTemplateRow } | null>(null);

  if (error) {
    return <Alert severity="error">{error instanceof Error ? error.message : "Ошибка загрузки"}</Alert>;
  }

  const gridTemplateColumns = `${NAME_COL}px repeat(${columns.length}, minmax(${AGE_COL}px, 1fr))${canManage ? ` ${ADD_COL}px` : ""}`;
  const paper = theme.palette.background.paper;
  const rowLine = { borderTop: 1, borderColor: "divider" } as const;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 0.75 }}>
      {/* Легенда одной строкой. */}
      <Stack direction="row" gap={1.75} flexWrap="wrap" alignItems="center" sx={{ flexShrink: 0, px: 0.5 }}>
        {[
          { key: "m", el: <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: "primary.main" }} />, text: "обязательная" },
          {
            key: "o",
            el: <Box sx={{ width: 12, height: 12, borderRadius: "50%", border: 1.5, borderStyle: "dashed", borderColor: "primary.main" }} />,
            text: "по желанию",
          },
          { key: "l", el: <Box sx={{ width: 18, height: LINE, bgcolor: alpha(main, 0.45) }} />, text: "дозы одной серии" },
        ].map((x) => (
          <Stack key={x.key} direction="row" gap={0.6} alignItems="center">
            {x.el}
            <Typography variant="caption" color="text.secondary">
              {x.text}
            </Typography>
          </Stack>
        ))}
        <Typography variant="caption" color="text.disabled">
          цифра — № дозы, «30 дн.» — срок «в срок»
        </Typography>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", border: 1, borderColor: "divider", borderRadius: "12px" }}>
        {loading ? (
          <Stack spacing={0.75} sx={{ p: 1.5 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={ROW_H - 8} />
            ))}
          </Stack>
        ) : groups.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">
              Календарь пуст — загрузите календарь КР или добавьте прививку
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns, gridAutoRows: ROW_H, minWidth: "max-content" }}>
            {/* Шапка: возраст одной строкой. */}
            <Box
              sx={{
                position: "sticky",
                top: 0,
                left: 0,
                zIndex: 3,
                bgcolor: paper,
                px: 1.5,
                display: "flex",
                alignItems: "center",
                borderBottom: 1,
                borderRight: 1,
                borderColor: "divider",
              }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Вакцина
              </Typography>
            </Box>
            {columns.map((c) => (
              <Box
                key={c.key}
                sx={{
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  bgcolor: paper,
                  borderBottom: 1,
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                }}
              >
                <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
                <Typography variant="caption" fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
                  {c.label}
                </Typography>
              </Box>
            ))}
            {canManage && (
              <Box sx={{ position: "sticky", top: 0, zIndex: 2, bgcolor: paper, borderBottom: 1, borderColor: "divider" }} />
            )}

            {/* Строки-линии: одна на вакцину. */}
            {groups.map((g, gi) => {
              const idx = g.doses.map((d) => columns.findIndex((c) => c.key === doseAgeText(d)));
              const first = Math.min(...idx);
              const last = Math.max(...idx);
              const top = gi ? rowLine : {};
              return (
                <Box key={g.vaccineId} sx={{ display: "contents" }}>
                  <Box
                    sx={{
                      ...top,
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      bgcolor: paper,
                      borderRight: 1,
                      borderRightColor: "divider",
                      px: 1.5,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      minWidth: 0,
                    }}
                  >
                    <Typography variant="body2" fontWeight={600} noWrap title={g.vaccineName} sx={{ minWidth: 0 }}>
                      {g.vaccineName}
                    </Typography>
                    {g.sexText !== "Всем" && (
                      <Box
                        component="span"
                        sx={{
                          flexShrink: 0,
                          fontSize: 10,
                          fontWeight: 700,
                          px: 0.6,
                          py: 0.1,
                          borderRadius: "6px",
                          color: "secondary.main",
                          bgcolor: alpha(theme.palette.secondary.main, 0.14),
                        }}
                      >
                        {g.sexText === "Девочкам" ? "дев." : g.sexText === "Мальчикам" ? "мал." : "разн."}
                      </Box>
                    )}
                  </Box>
                  {columns.map((c, i) => {
                    const here = dosesAt(g, c);
                    const left = i > first && i <= last;
                    const right = i >= first && i < last;
                    return (
                      <Box
                        key={c.key}
                        sx={{ ...top, position: "relative", display: "flex", justifyContent: "center", alignItems: "center" }}
                      >
                        {(left || right) && (
                          <Box
                            sx={{
                              position: "absolute",
                              top: `calc(50% - ${LINE / 2}px)`,
                              height: LINE,
                              left: left ? 0 : "50%",
                              right: right ? 0 : "50%",
                              bgcolor: alpha(main, 0.45),
                            }}
                          />
                        )}
                        {here.map((d) => (
                          <DoseStop
                            key={d.id}
                            d={d}
                            onClick={canManage ? (e) => setMenu({ anchor: e.currentTarget, row: d }) : undefined}
                          />
                        ))}
                      </Box>
                    );
                  })}
                  {canManage && (
                    <Box sx={{ ...top, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Tooltip title={`Добавить дозу ${g.nextDose}`} arrow disableInteractive>
                        <ButtonBase
                          onClick={() => onAddDose(g.vaccineId, g.nextDose)}
                          aria-label={`Добавить дозу ${g.nextDose} — ${g.vaccineName}`}
                          sx={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            color: "text.disabled",
                            "&:hover": { color: "primary.main", bgcolor: alpha(main, 0.12) },
                          }}
                        >
                          <AddRounded sx={{ fontSize: 18 }} />
                        </ButtonBase>
                      </Tooltip>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      <Menu anchorEl={menu?.anchor ?? null} open={menu != null} onClose={() => setMenu(null)}>
        {menu && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2, pt: 0.5, pb: 1, maxWidth: 280 }}>
            {doseTooltip(menu.row)}
          </Typography>
        )}
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
