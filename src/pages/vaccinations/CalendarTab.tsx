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

const NAME_COL = 210;
const AGE_COL = 92;
const ADD_COL = 76;

/** Подсказка дозы: всё, что в кружке не помещается. */
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

/** Доза кружком с номером: сплошная — обязательная, пунктир — по желанию. */
const DosePill: React.FC<{ d: CalendarTemplateRow; onClick?: (e: React.MouseEvent<HTMLElement>) => void }> = ({
  d,
  onClick,
}) => {
  const theme = useTheme();
  const main = theme.palette.primary.main;
  return (
    <Tooltip title={doseTooltip(d)} arrow placement="top">
      <ButtonBase
        onClick={onClick}
        disableRipple={!onClick}
        aria-label={doseTooltip(d)}
        sx={{
          flexDirection: "column",
          gap: 0.25,
          px: 0.75,
          py: 0.5,
          borderRadius: "10px",
          opacity: d.isActive ? 1 : 0.4,
          transition: "background-color .15s ease, transform .15s ease",
          "&:hover": { bgcolor: alpha(main, 0.1), transform: "translateY(-1px)" },
          cursor: onClick ? "pointer" : "default",
        }}
      >
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 14,
            fontVariantNumeric: "tabular-nums",
            color: d.mandatory ? theme.palette.primary.contrastText : main,
            bgcolor: d.mandatory ? main : "transparent",
            border: d.mandatory ? "none" : `1.5px dashed ${main}`,
            boxShadow: d.mandatory ? `0 2px 8px ${alpha(main, 0.35)}` : "none",
          }}
        >
          {d.doseNumber}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.1, whiteSpace: "nowrap" }}>
          {d.dueWindowDays} дн.{d.sex === "female" ? " · дев." : d.sex === "male" ? " · мал." : ""}
        </Typography>
      </ButtonBase>
    </Tooltip>
  );
};

/**
 * Календарь прививок организации таблицей «вакцина × возраст», как плакат
 * национального календаря: строка — вакцина, колонка — возрастная точка,
 * кружок — доза. Кружок открывает «Изменить / Удалить», «+ доза» — следующая.
 */
const CalendarTab: React.FC<Props> = ({ rows, loading, error, canManage, onEdit, onDelete, onAddDose }) => {
  const theme = useTheme();
  const groups = React.useMemo(() => groupCalendarByVaccine(rows), [rows]);
  const columns = React.useMemo(() => ageColumns(rows), [rows]);
  const [menu, setMenu] = React.useState<{ anchor: HTMLElement; row: CalendarTemplateRow } | null>(null);

  if (error) {
    return <Alert severity="error">{error instanceof Error ? error.message : "Ошибка загрузки"}</Alert>;
  }

  const gridTemplateColumns = `${NAME_COL}px repeat(${columns.length}, minmax(${AGE_COL}px, 1fr))${canManage ? ` ${ADD_COL}px` : ""}`;
  const paper = theme.palette.background.paper;
  const stickyName = {
    position: "sticky",
    left: 0,
    zIndex: 1,
    bgcolor: paper,
    borderRight: 1,
    borderColor: "divider",
  } as const;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 1 }}>
      {/* Легенда: как читать кружки. */}
      <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center" sx={{ flexShrink: 0, px: 0.5 }}>
        <Stack direction="row" gap={0.75} alignItems="center">
          <Box sx={{ width: 14, height: 14, borderRadius: "50%", bgcolor: "primary.main" }} />
          <Typography variant="caption" color="text.secondary">
            обязательная доза
          </Typography>
        </Stack>
        <Stack direction="row" gap={0.75} alignItems="center">
          <Box sx={{ width: 14, height: 14, borderRadius: "50%", border: 1.5, borderStyle: "dashed", borderColor: "primary.main" }} />
          <Typography variant="caption" color="text.secondary">
            по желанию
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          цифра — номер дозы, под ней — сколько дней на прививку «в срок»
        </Typography>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", border: 1, borderColor: "divider", borderRadius: "12px" }}>
        {loading ? (
          <Stack spacing={1} sx={{ p: 2 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={56} />
            ))}
          </Stack>
        ) : groups.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">
              Календарь пуст — загрузите календарь КР или добавьте прививку
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns, minWidth: "max-content" }}>
            {/* Шапка: возрастная шкала. */}
            <Box
              sx={{
                ...stickyName,
                top: 0,
                zIndex: 3,
                px: 2,
                py: 1.25,
                display: "flex",
                alignItems: "flex-end",
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Вакцина
              </Typography>
            </Box>
            {columns.map((c, i) => (
              <Box
                key={c.key}
                sx={{
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  bgcolor: paper,
                  borderBottom: 1,
                  borderColor: "divider",
                  px: 0.5,
                  pt: 1.25,
                  pb: 1,
                  textAlign: "center",
                }}
              >
                <Typography variant="caption" fontWeight={700} sx={{ display: "block", whiteSpace: "nowrap" }}>
                  {c.label}
                </Typography>
                {/* Ось возраста: точка на сквозной линии. */}
                <Box sx={{ position: "relative", height: 10, mt: 0.5 }}>
                  <Box
                    sx={{
                      position: "absolute",
                      top: 4,
                      left: i === 0 ? "50%" : 0,
                      right: i === columns.length - 1 ? "50%" : 0,
                      height: 2,
                      bgcolor: alpha(theme.palette.primary.main, 0.25),
                    }}
                  />
                  <Box
                    sx={{
                      position: "absolute",
                      top: 1,
                      left: "calc(50% - 4px)",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: "primary.main",
                    }}
                  />
                </Box>
              </Box>
            ))}
            {canManage && <Box sx={{ position: "sticky", top: 0, zIndex: 2, bgcolor: paper, borderBottom: 1, borderColor: "divider" }} />}

            {/* Строки: одна на вакцину. */}
            {groups.map((g, gi) => {
              const zebra = gi % 2 === 1 ? alpha(theme.palette.text.primary, 0.025) : "transparent";
              return (
                <React.Fragment key={g.vaccineId}>
                  <Box sx={{ ...stickyName, px: 2, py: 1, display: "flex", flexDirection: "column", justifyContent: "center", borderTop: gi ? 1 : 0, borderTopColor: "divider", backgroundImage: `linear-gradient(${zebra}, ${zebra})` }}>
                    <Typography variant="body2" fontWeight={600} noWrap title={g.vaccineName}>
                      {g.vaccineName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {g.doses.length} {g.doses.length === 1 ? "доза" : g.doses.length < 5 ? "дозы" : "доз"} · {g.sexText}
                    </Typography>
                  </Box>
                  {columns.map((c) => {
                    const here = dosesAt(g, c);
                    return (
                      <Box
                        key={c.key}
                        sx={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          py: 0.75,
                          borderTop: gi ? 1 : 0,
                          borderColor: "divider",
                          bgcolor: zebra,
                        }}
                      >
                        {here.map((d) => (
                          <DosePill
                            key={d.id}
                            d={d}
                            onClick={canManage ? (e) => setMenu({ anchor: e.currentTarget, row: d }) : undefined}
                          />
                        ))}
                      </Box>
                    );
                  })}
                  {canManage && (
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", borderTop: gi ? 1 : 0, borderColor: "divider", bgcolor: zebra }}>
                      <Tooltip title={`Добавить дозу ${g.nextDose}`} arrow>
                        <ButtonBase
                          onClick={() => onAddDose(g.vaccineId, g.nextDose)}
                          aria-label={`Добавить дозу ${g.nextDose} — ${g.vaccineName}`}
                          sx={{
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            border: 1,
                            borderStyle: "dashed",
                            borderColor: "divider",
                            color: "text.secondary",
                            "&:hover": { color: "primary.main", borderColor: "primary.main" },
                          }}
                        >
                          <AddRounded fontSize="small" />
                        </ButtonBase>
                      </Tooltip>
                    </Box>
                  )}
                </React.Fragment>
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
