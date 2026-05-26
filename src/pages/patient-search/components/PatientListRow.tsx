/**
 * PatientListRow.tsx
 * Презентационный подкомпонент одной строки списка пациентов.
 * Отвечает за: аватар с инициалами, ФИО, телефон, визуальное выделение выбранного.
 * Не содержит логики загрузки/фильтрации/пагинации — только отображение и клик.
 */
import React from "react";
import {
  Avatar,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
  ListItemAvatar,
  Tooltip,
} from "@mui/material";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";

export type PatientListRowProps = {
  patient: {
    fio: string;
    phone?: string;
    photo?: string | null;
    is_blacklisted?: boolean | null;
    blacklist_reason?: string | null;
  };
  selected?: boolean;
  onClick?: () => void;
};

function getInitials(fullName?: string): string {
  if (!fullName) return "—";
  const parts = String(fullName).trim().split(/\s+/);
  const a = (parts[0] || "").charAt(0);
  const b = (parts[1] || "").charAt(0);
  const c = (parts[2] || "").charAt(0);
  return (a + (b || c) || a || "—").toUpperCase();
}

const PatientListRow: React.FC<PatientListRowProps> = ({
  patient,
  selected = false,
  onClick,
}) => {
  return (
    <ListItemButton
      selected={!!selected}
      onClick={onClick}
      sx={{
        px: 2,
        py: 1.25,
        my: "5px", // 10px между элементами (5px сверху и снизу)
        border: "1px solid transparent",
        borderRadius: 1,
        "&:hover": {
          bgcolor: (theme) => theme.palette.action.hover,
        },
        "&.Mui-selected": {
          borderColor: (theme) => theme.palette.primary.main,
          bgcolor: (theme) => theme.palette.action.selected,
          borderLeft: "3px solid",
          borderLeftColor: (theme) => theme.palette.primary.main,
        },
      }}
    >
      {/* Секция: аватар + текст */}
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ width: 1 }}>
        <ListItemAvatar>
          <Avatar
            src={patient.photo || undefined}
            sx={{
              width: 28,
              height: 28,
              bgcolor: (theme) => theme.palette.primary.main,
              fontSize: 12,
            }}
          >
            {getInitials(patient.fio)}
          </Avatar>
        </ListItemAvatar>
        <ListItemText
          primary={
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="subtitle2" noWrap>
                {patient.fio || "Без имени"}
              </Typography>
              {patient.is_blacklisted && (
                <Tooltip title={patient.blacklist_reason || "Причина не указана"} arrow>
                  <ReportProblemIcon color="error" sx={{ fontSize: 16 }} />
                </Tooltip>
              )}
            </Stack>
          }
          secondary={
            <Typography variant="caption" color="text.secondary" noWrap>
              {patient.phone || "—"}
            </Typography>
          }
        />
      </Stack>
    </ListItemButton>
  );
};

export default PatientListRow;
