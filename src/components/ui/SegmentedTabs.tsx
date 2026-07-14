import React from "react";
import { Box } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion } from "framer-motion";

const MotionBox = motion(Box);

export interface SegmentedTab<K extends string = string> {
  key: K;
  label: string;
  icon?: React.ReactElement;
  /** Счётчик справа от подписи (например, число записей). */
  badge?: number;
}

export interface SegmentedTabsProps<K extends string = string> {
  tabs: SegmentedTab<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Уникален на страницу — иначе подвижные фоны разных групп «перелетают» друг к другу. */
  layoutId: string;
}

/**
 * Сегментированный переключатель секций — компактный «тумблер» по гайду §5.7
 * (вынесен из страницы Профиль): группа в тонкой грани, у активного — заливка
 * primary с подвижным фоном (framer-motion layoutId).
 */
export function SegmentedTabs<K extends string = string>({
  tabs,
  value,
  onChange,
  layoutId,
}: SegmentedTabsProps<K>) {
  return (
    <Box
      role="tablist"
      sx={{
        display: "flex",
        gap: 0.5,
        p: 0.5,
        borderRadius: "10px",
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        width: "fit-content",
        maxWidth: "100%",
        overflowX: "auto",
      }}
    >
      {tabs.map((tabItem) => {
        const selected = tabItem.key === value;
        return (
          <Box
            key={tabItem.key}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tabItem.key)}
            sx={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: { xs: 1.5, sm: 2 },
              py: 0.85,
              borderRadius: "7px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontSize: "0.85rem",
              fontWeight: 500,
              userSelect: "none",
              color: selected ? "primary.contrastText" : "text.secondary",
              transition: "color .2s ease",
              "& .MuiSvgIcon-root": { fontSize: 17 },
              "&:hover": { color: selected ? "primary.contrastText" : "text.primary" },
              zIndex: 1,
            }}
          >
            {selected && (
              <MotionBox
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                sx={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "7px",
                  bgcolor: "primary.main",
                  zIndex: -1,
                }}
              />
            )}
            {tabItem.icon}
            {tabItem.label}
            {tabItem.badge != null && (
              <Box
                component="span"
                sx={(t) => ({
                  ml: 0.25,
                  px: 0.75,
                  minWidth: 20,
                  height: 18,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                  bgcolor: selected
                    ? alpha(t.palette.primary.contrastText, 0.22)
                    : "action.hover",
                  color: "inherit",
                })}
              >
                {tabItem.badge}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

export default SegmentedTabs;
