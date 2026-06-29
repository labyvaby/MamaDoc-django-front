import React from "react";
import { Box, Card, CardContent, Stack, Typography, Skeleton, alpha, useTheme } from "@mui/material";
import type { SaleStats } from "../../../api/sales";
import { formatKGS } from "../../../utility/format";

interface SalesKpiCardsProps {
    stats: SaleStats | null;
    loading: boolean;
}

type KpiColor = "primary" | "success" | "info" | "warning";

export const SalesKpiCards: React.FC<SalesKpiCardsProps> = ({ stats, loading }) => {
    const theme = useTheme();

    const cards: { title: string; value: string; secondary: string; color: KpiColor }[] =
        React.useMemo(() => {
            const s = stats;
            const paidShare =
                s && s.revenue > 0 ? Math.round((s.cashTotal / s.revenue) * 100) : 0;
            return [
                {
                    title: "Продаж",
                    value: s ? String(s.count) : "0",
                    secondary: "за период",
                    color: "primary",
                },
                {
                    title: "Оборот",
                    value: formatKGS(s?.revenue ?? 0),
                    secondary: "сумма продаж",
                    color: "success",
                },
                {
                    title: "Средний чек",
                    value: formatKGS(s?.avgCheck ?? 0),
                    secondary: "на продажу",
                    color: "info",
                },
                {
                    title: "Наличные / безнал",
                    value: `${formatKGS(s?.cashTotal ?? 0)} / ${formatKGS(s?.cashlessTotal ?? 0)}`,
                    secondary: s ? `нал ${paidShare}%` : "—",
                    color: "warning",
                },
            ];
        }, [stats]);

    return (
        <Box sx={{ display: "flex", gap: { xs: 1, md: 1.5 }, flexWrap: { xs: "wrap", lg: "nowrap" } }}>
            {cards.map((card, idx) => (
                <Box key={idx} sx={{ flex: "1 1 0", minWidth: { xs: "calc(50% - 4px)", lg: 0 } }}>
                    <Card
                        variant="outlined"
                        sx={{
                            bgcolor: alpha(
                                theme.palette[card.color].main,
                                theme.palette.mode === "dark" ? 0.16 : 0.1,
                            ),
                            borderColor: alpha(theme.palette[card.color].main, 0.2),
                            height: "100%",
                        }}
                    >
                        <CardContent sx={{ p: { xs: 1, md: 1.5 }, "&:last-child": { pb: { xs: 1, md: 1.5 } } }}>
                            <Stack spacing={0}>
                                <Typography
                                    sx={{
                                        color: `${card.color}.onSurface`,
                                        fontWeight: 700,
                                        fontSize: { xs: "0.6rem", md: "0.65rem" },
                                        letterSpacing: 0.5,
                                        lineHeight: 1.3,
                                    }}
                                >
                                    {card.title}
                                </Typography>
                                {loading ? (
                                    <Skeleton width="70%" height={26} />
                                ) : (
                                    <Typography
                                        fontWeight={700}
                                        noWrap
                                        sx={{
                                            color: `${card.color}.onSurface`,
                                            fontSize: { xs: "0.95rem", sm: "1.05rem", md: "1.15rem" },
                                            lineHeight: 1.1,
                                        }}
                                    >
                                        {card.value}
                                    </Typography>
                                )}
                                <Typography
                                    variant="caption"
                                    noWrap
                                    sx={{
                                        color: "text.secondary",
                                        fontWeight: 500,
                                        display: "block",
                                        fontSize: { xs: "0.55rem", md: "0.6rem" },
                                        lineHeight: 1.3,
                                    }}
                                >
                                    {card.secondary}
                                </Typography>
                            </Stack>
                        </CardContent>
                    </Card>
                </Box>
            ))}
        </Box>
    );
};
