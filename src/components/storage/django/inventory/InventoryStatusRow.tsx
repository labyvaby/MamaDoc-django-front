import React from "react";
import { Box } from "@mui/material";

import { statusTone, type InventoryStatus } from "./inventoryModel";

export type InventoryStatusRowProps = {
    status: InventoryStatus;
    title: React.ReactNode;
    meta?: React.ReactNode;
    /** Числовая часть справа (факт/ожидание, разница). */
    right?: React.ReactNode;
    actions?: React.ReactNode;
    /** Строка без статусной подложки — серые «ещё не пикнутые» позиции. */
    plain?: boolean;
};

/**
 * Строка позиции: весь пункт красится цветом своего разряда — подложка,
 * левый рельс и числа. Одна и та же хрома на экране пересчёта и в итогах.
 */
export const InventoryStatusRow: React.FC<InventoryStatusRowProps> = ({
    status,
    title,
    meta,
    right,
    actions,
    plain = false,
}) => (
    <Box
        sx={(t) => {
            const tone = statusTone(t, status);
            return {
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 1.5,
                pr: 1.75,
                py: 1.25,
                pl: plain ? 1.75 : 1.5,
                borderTop: 1,
                borderColor: "divider",
                borderLeft: plain ? 0 : `3px solid ${tone.main}`,
                bgcolor: plain ? "transparent" : tone.tint,
                "&:first-of-type": { borderTop: 0 },
            };
        }}
    >
        <Box sx={{ flex: 1, minWidth: 180 }}>
            {title}
            {meta}
        </Box>
        {right}
        {actions}
    </Box>
);

export default InventoryStatusRow;
