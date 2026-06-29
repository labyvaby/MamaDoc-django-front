import React from "react";
import {
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from "@mui/material";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import type { SaleDayAggregate } from "../../../api/sales";
import { formatKGS } from "../../../utility/format";
import { ListLoadingSkeleton, ListEmptyState } from "../../ui";

interface SalesByDayViewProps {
    rows: SaleDayAggregate[];
    loading: boolean;
}

export const SalesByDayView: React.FC<SalesByDayViewProps> = ({ rows, loading }) => {
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
                    icon={<CalendarMonthOutlined />}
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
                            <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>День</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700, bgcolor: "background.paper" }}>
                                Продаж
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "background.paper" }}>
                                Оборот
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((r) => (
                            <TableRow key={r.day} hover>
                                <TableCell sx={{ fontWeight: 500 }}>
                                    {new Date(r.day).toLocaleDateString("ru-RU")}
                                </TableCell>
                                <TableCell align="center">{r.count}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>
                                    {formatKGS(r.totalAmount)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};
