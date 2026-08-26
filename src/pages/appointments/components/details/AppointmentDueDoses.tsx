import React from "react";
import { Box, Button, Checkbox, Collapse, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import VaccinesOutlined from "@mui/icons-material/VaccinesOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import dayjs from "dayjs";

import type { VaccinationScheduleSlot } from "../../../../api/vaccinations";
import { scheduleDateInfo } from "../../../vaccinations/meta";
import { useT } from "../../../../i18n/VerticalProvider";

/** Просрочка дольше этого — уже не «опоздали», а «не делали» (см. doseInfo). */
const LONG_OVERDUE_DAYS = 30;

/** Со скольких доз список сворачивается по умолчанию. */
const COLLAPSE_FROM = 3;

export interface AppointmentDueDosesProps {
  /** Положенные (planned/overdue) дозы по календарю пациента. */
  dueDoses: VaccinationScheduleSlot[];
  /** Ввести одну дозу — вакцина и номер уйдут в дровер предзаполненными. */
  onRecord?: (prefill: { vaccineId: number; doseNumber: number }) => void;
  /** Ввести несколько выбранных доз за один визит. */
  onRecordMulti?: (
    doses: { vaccineId: number; vaccineName: string; doseNumber: number }[],
  ) => void;
}

/**
 * «Положено по календарю» — прогноз вакцинации с вводом дозы в 1–2 клика.
 *
 * Живёт в карточке приёма ПОСЛЕ услуг и товаров: это подсказка «заодно можно
 * ввести», а не содержание визита.
 */
const AppointmentDueDoses: React.FC<AppointmentDueDosesProps> = ({
  dueDoses,
  onRecord,
  onRecordMulti,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();

  // Мульти-ввод: чекбоксы при ≥2 дозах, по умолчанию выбраны все (как в зрелых
  // системах — снимаешь лишнее). Сброс при смене прогноза.
  const multiDue = dueDoses.length >= 2;
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  React.useEffect(() => {
    setSelectedIds(new Set(dueDoses.map((d) => d.id)));
  }, [dueDoses]);

  // На невакцинированном пациенте доз бывает 5–8 — такой список сворачиваем.
  const collapsible = dueDoses.length >= COLLAPSE_FROM;
  const [expanded, setExpanded] = React.useState(true);
  React.useEffect(() => {
    setExpanded(dueDoses.length < COLLAPSE_FROM);
  }, [dueDoses]);

  const toggleDose = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedInputs = dueDoses
    .filter((d) => selectedIds.has(d.id))
    .map((d) => ({ vaccineId: d.vaccineId, vaccineName: d.vaccineName, doseNumber: d.doseNumber }));

  /**
   * Срок дозы для карточки приёма. В модуле вакцин «просрочено на N дней»
   * красным уместно, здесь — нет: на невакцинированном пациенте это сотни дней,
   * то есть «никогда не делали», а не «опоздали». Красный кричал громче всего в
   * карточке и уводил внимание с текущего визита, поэтому давнюю просрочку
   * показываем нейтрально и датой.
   */
  const doseInfo = (slot: VaccinationScheduleSlot) => {
    const info = scheduleDateInfo(slot.scheduledDate, slot.status);
    if (info.overdue) {
      const days = dayjs().startOf("day").diff(dayjs(slot.scheduledDate).startOf("day"), "day");
      if (days > LONG_OVERDUE_DAYS) {
        return {
          text: t("details.notDoneSince", {
            date: dayjs(slot.scheduledDate).format("DD.MM.YYYY"),
          }),
          color: "text.secondary" as const,
          bold: false,
          highlight: false,
        };
      }
      return { text: info.text, color: "warning.main" as const, bold: true, highlight: true };
    }
    return {
      text: info.text,
      color: info.soon ? ("warning.main" as const) : ("text.secondary" as const),
      bold: info.soon,
      highlight: false,
    };
  };

  if (dueDoses.length === 0) return null;

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1} mb={0.75}>
        <VaccinesOutlined sx={{ fontSize: 18, color: "primary.onSurface" }} />
        <Typography variant="caption" color="text.secondary">
          {t("details.byCalendar")}
        </Typography>
        {collapsible && (
          <Typography variant="caption" color="text.disabled">
            {t("details.dosesCount", { count: dueDoses.length })}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {multiDue && expanded && (
          <Button
            size="small"
            variant="contained"
            disabled={selectedInputs.length === 0}
            startIcon={<VaccinesOutlined sx={{ fontSize: 16 }} />}
            onClick={() => onRecordMulti?.(selectedInputs)}
            sx={{ boxShadow: "none", textTransform: "none", borderRadius: "8px" }}
          >
            {t("details.recordSelected", { count: selectedInputs.length })}
          </Button>
        )}
        {collapsible && (
          <Button
            size="small"
            onClick={() => setExpanded((v) => !v)}
            endIcon={
              <ExpandMoreOutlined
                sx={{
                  fontSize: 18,
                  transition: "transform 0.2s",
                  transform: expanded ? "rotate(180deg)" : "none",
                }}
              />
            }
            sx={{ textTransform: "none", flexShrink: 0 }}
          >
            {expanded ? t("details.hideDoses") : t("details.showDoses")}
          </Button>
        )}
      </Stack>

      {/* Свёрнуто — перечисляем вакцины строкой, чтобы было понятно, о чём
          речь, без раскрытия всего списка. */}
      {collapsible && !expanded && (
        <Typography variant="body2" color="text.secondary" noWrap>
          {dueDoses.map((d) => d.vaccineName).join(", ")}
        </Typography>
      )}

      <Collapse in={!collapsible || expanded} unmountOnExit>
        <Stack spacing={1}>
          {dueDoses.map((slot) => {
            const info = doseInfo(slot);
            return (
              <Paper
                key={slot.id}
                variant="outlined"
                sx={{
                  p: 1.25,
                  pl: multiDue ? 1 : 1.75,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  borderRadius: "10px",
                  bgcolor: info.highlight
                    ? alpha(theme.palette.warning.main, 0.05)
                    : "background.paper",
                  borderColor: info.highlight
                    ? alpha(theme.palette.warning.main, 0.3)
                    : "divider",
                }}
              >
                {multiDue && (
                  <Checkbox
                    size="small"
                    checked={selectedIds.has(slot.id)}
                    onChange={() => toggleDose(slot.id)}
                    sx={{ p: 0.5 }}
                  />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {t("details.vaccineDose", {
                      vaccine: slot.vaccineName,
                      dose: slot.doseNumber,
                    })}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: info.color, fontWeight: info.bold ? 600 : 400 }}
                  >
                    {info.text}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant={multiDue ? "outlined" : "contained"}
                  startIcon={<VaccinesOutlined sx={{ fontSize: 16 }} />}
                  onClick={() =>
                    onRecord?.({ vaccineId: slot.vaccineId, doseNumber: slot.doseNumber })
                  }
                  sx={{
                    boxShadow: "none",
                    textTransform: "none",
                    flexShrink: 0,
                    borderRadius: "8px",
                  }}
                >
                  {t("details.record")}
                </Button>
              </Paper>
            );
          })}
        </Stack>
      </Collapse>
    </Box>
  );
};

export default AppointmentDueDoses;
