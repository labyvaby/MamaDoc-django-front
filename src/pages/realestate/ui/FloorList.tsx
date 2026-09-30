import { Box, ButtonBase, Typography } from "@mui/material";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";

import type { Project, Unit } from "../../../api/realestate";
import { useT } from "../../../i18n/VerticalProvider";
import { floorType, sectionLabel, type BoardModel, type BoardPaint, type PriceScale } from "../model/board";
import { formatArea, formatRooms, holdLeft, millions, perSqmShort } from "../model/units";
import { useMinuteClock } from "../model/useMinuteClock";
import { heatTone, statusTone } from "./tones";

/**
 * Шахматка на телефоне: сетка шириной в корпус не помещается, поэтому этажи идут
 * списком сверху вниз, в каждом — квартиры строками. Отфильтрованные не показываем.
 */
export function FloorList({
  project,
  board,
  isVisible,
  paint,
  scale,
  onOpen,
}: {
  project: Project;
  board: BoardModel;
  isVisible: (unit: Unit) => boolean;
  paint: BoardPaint;
  scale: PriceScale;
  onOpen: (unitId: string) => void;
}) {
  const { t } = useT("realestate");
  const now = useMinuteClock();
  const floors = board.floors
    .map((floor) => ({ floor, units: board.unitsOnFloor(floor).filter(isVisible) }))
    .filter((f) => f.units.length);
  const showSection = board.sections.length > 1;

  if (!floors.length) {
    return (
      <Typography sx={{ py: 4, textAlign: "center", fontSize: "0.8125rem", color: "text.secondary" }}>
        {t("list.empty")}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {floors.map(({ floor, units }) => {
        const stats = board.floorStats(floor);
        return (
          <Box component="section" key={floor} aria-label={t("cell.floor", { floor })}>
            <Box sx={{ mb: 0.75, display: "flex", alignItems: "baseline", gap: 1 }}>
              <Typography component="h3" sx={{ fontSize: "0.9rem", fontWeight: 700 }}>
                {t("cell.floor", { floor })}
              </Typography>
              <Typography component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                {floorType(project, floor)} · {stats.free} {t("board.ofTotal", { total: stats.total })}
              </Typography>
            </Box>
            <Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", overflow: "hidden" }}>
              {units.map((unit, i) => {
                const hold = unit.hold ? holdLeft(unit.hold.endsAt, now) : null;
                const heat = paint === "price" && unit.status === "free" ? scale.stepOf(unit.pricePerSqm) : null;
                return (
                  <ButtonBase
                    key={unit.id}
                    onClick={() => onOpen(unit.id)}
                    sx={(t) => ({
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      px: 1.5,
                      py: 1.25,
                      textAlign: "left",
                      borderTop: i ? 1 : 0,
                      borderColor: "divider",
                      bgcolor: heat !== null ? heatTone(t, heat).bg : unit.status === "free" ? "background.paper" : statusTone(t, unit.status).bg,
                      opacity: paint === "price" && unit.status !== "free" ? 0.55 : 1,
                    })}
                  >
                    <Box
                      component="i"
                      aria-hidden
                      sx={(t) => ({ flexShrink: 0, width: 8, height: 8, borderRadius: "50%", bgcolor: statusTone(t, unit.status).main })}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                        №{unit.number} · {formatRooms(unit.rooms)} · {formatArea(unit.totalArea)}
                      </Typography>
                      <Typography sx={{ fontSize: "0.72rem", color: hold?.urgent ? "error.main" : "text.secondary" }} noWrap>
                        {[
                          showSection && sectionLabel(unit.section),
                          unit.orientation,
                          unit.status === "reserved" &&
                            (hold ? (hold.expired ? t("cell.holdExpiredLower") : t("cell.holdLeftLower", { left: hold.label })) : t("cell.holdLower")),
                          unit.status === "sold" && t("cell.soldLower"),
                          unit.hold?.awaitingPayment && t("cell.awaitingPaymentLower"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{millions(unit.price)}</Typography>
                      <Typography sx={{ fontSize: "0.68rem", color: "text.secondary" }}>{perSqmShort(unit.pricePerSqm)}</Typography>
                    </Box>
                    <ChevronRightOutlined sx={{ fontSize: 18, color: "text.disabled" }} />
                  </ButtonBase>
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
