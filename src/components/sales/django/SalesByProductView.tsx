import React from "react";
import {
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Box,
} from "@mui/material";
import InventoryOutlined from "@mui/icons-material/InventoryOutlined";
import type { SaleProductTotal } from "../../../api/sales";
import { formatKGS } from "../../../utility/format";
import { ListLoadingSkeleton, ListEmptyState } from "../../ui";

interface SalesByProductViewProps {
    rows: SaleProductTotal[];
    loading: boolean;
}

export const SalesByProductView: React.FC<SalesByProductViewProps> = ({ rows, loading }) => {
    if (loading) {
        return (
            <Paper variant="outlined" elevation={0} sx={{ overflow: "hidden" }}>
                <ListLoadingSkeleton rows={8} />
            </Paper>
        );
    }

    if (rows.length === 0) {
        return (
            <Paper variant="outlined" elevation={0} sx={{ minHeight: 240, display: "flex" }}>
                <ListEmptyState
                    icon={<InventoryOutlined />}
                    title="Нет продаж за выбранный период"
                    description="За выбранный период и фильтры продаж нет."
                />
            </Paper>
        );
    }

    return (
        <Paper variant="outlined" elevation={0} sx={{ overflow: "hidden" }}>
            <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Товар</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700, bgcolor: "background.paper" }}>
                                Продано
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "background.paper" }}>
                                Выручка
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((r) => (
                            <TableRow key={r.productId} hover>
                                <TableCell>
                                    <Box sx={{ fontWeight: 500 }}>{r.productName}</Box>
                                </TableCell>
                                <TableCell align="center">{r.quantity}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>
                                    {formatKGS(r.revenue)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};
