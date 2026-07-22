/**
 * PatientListRow.tsx
 * Презентационный подкомпонент одной строки списка пациентов.
 * Отвечает за: аватар с инициалами, ФИО, телефон, визуальное выделение выбранного.
 * Не содержит логики загрузки/фильтрации/пагинации — только отображение и клик.
 */
import React from "react";
import { Box, Typography, Tooltip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ReportProblemIcon from "@mui/icons-material/ReportProblemOutlined";
import { UserAvatar } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";

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

const PatientListRow: React.FC<PatientListRowProps> = ({
  patient,
  selected = false,
  onClick,
}) => {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      sx={(t) => ({
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        p: 1.25,
        borderRadius: "10px",
        cursor: "pointer",
        border: 1,
        borderColor: selected ? alpha(t.palette.primary.main, 0.4) : "transparent",
        bgcolor: selected
          ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.16 : 0.09)
          : "transparent",
        transition: "background-color .15s ease, border-color .15s ease",
        "&:hover": {
          borderColor: selected ? undefined : alpha(t.palette.primary.main, 0.24),
          bgcolor: selected ? undefined : subtleBg(t),
        },
        "&:focus-visible": {
          outline: "none",
          borderColor: alpha(t.palette.primary.main, 0.5),
        },
      })}
    >
      <Box sx={{ position: "relative", flexShrink: 0 }}>
        <UserAvatar
          src={patient.photo}
          name={patient.fio}
          size={38}
          sx={{ borderRadius: "10px", fontSize: 13 }}
        />
        {patient.is_blacklisted && (
          <Tooltip title={patient.blacklist_reason || "Причина не указана"} arrow>
            <Box
              sx={(t) => ({
                position: "absolute",
                right: -3,
                bottom: -3,
                width: 15,
                height: 15,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `2.5px solid ${t.palette.background.paper}`,
                bgcolor: t.palette.error.main,
              })}
            >
              <ReportProblemIcon sx={{ fontSize: 9, color: "common.white" }} />
            </Box>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {patient.fio || "Без имени"}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {patient.phone || "—"}
        </Typography>
      </Box>
    </Box>
  );
};

export default PatientListRow;
