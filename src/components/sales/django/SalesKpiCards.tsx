import React from "react";
import { Box, Card, CardContent, Stack, Typography, Skeleton, alpha, useTheme } from "@mui/material";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import type { SaleStats } from "../../../api/sales";
import { formatKGS } from "../../../utility/format";
import { subtleBg } from "../../../theme";

interface SalesKpiCardsProps {
    stats: SaleStats | null;
    loading: boolean;
}

type KpiColor = "primary" | "success" | "info" | "warning";

/**
 * KPI-плитки продаж в спокойном фирменном стиле: нейтральная карточка,
 * цветовой акцент — только на тонированной иконке (как InfoTile).
 */
export const SalesKpiCards: React.FC<SalesKpiCardsProps> = ({ stats, loading }) => {
    const theme = useTheme();

    const cards: {
        title: string;
        value: string;
        secondary: string;
        color: KpiColor;
        icon: React.ReactNode;
    }[] = React.useMemo(() => {
        const s = stats;
        const paidShare =
            s && s.revenue > 0 ? Math.round((s.cashTotal / s.revenue) * 100) : 0;
        return [
            {
                title: "Продаж",
                value: s ? String(s.count) : "0",
                secondary: "за период",
                color: "primary",
                icon: <ReceiptLongOutlined />,
            },
            {
                title: "Оборот",
                value: formatKGS(s?.revenue ?? 0),
                secondary: "сумма продаж",
                color: "success",
                icon: <PaymentsOutlined />,
            },
            {
                title: "Средний чек",
                value: formatKGS(s?.avgCheck ?? 0),
                secondary: "на продажу",
                color: "info",
                icon: <TrendingUpOutlined />,
            },
            {
                title: "Наличные / безнал",
                value: `${formatKGS(s?.cashTotal ?? 0)} / ${formatKGS(s?.cashlessTotal ?? 0)}`,
                secondary: s ? `нал ${paidShare}%` : "—",
                color: "warning",
                icon: <AccountBalanceWalletOutlined />,
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
                            height: "100%",
                            bgcolor: subtleBg(theme),
                            borderColor: "divider",
                            transition: "border-color .15s ease",
                            "&:hover": {
                                borderColor: alpha(theme.palette[card.color].main, 0.28),
                            },
                        }}
                    >
                        <CardContent sx={{ p: { xs: 1.25, md: 1.5 }, "&:last-child": { pb: { xs: 1.25, md: 1.5 } } }}>
                            <Stack direction="row" alignItems="center" gap={1.25}>
                                <Box
                                    sx={{
                                        width: { xs: 34, md: 38 },
                                        height: { xs: 34, md: 38 },
                                        borderRadius: "10px",
                                        flexShrink: 0,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color:
                                            theme.palette.mode === "dark"
                                                ? theme.palette[card.color].light
                                                : theme.palette[card.color].dark,
                                        bgcolor: alpha(
                                            theme.palette[card.color].main,
                                            theme.palette.mode === "dark" ? 0.18 : 0.1,
                                        ),
                                        "& .MuiSvgIcon-root": { fontSize: { xs: 18, md: 20 } },
                                    }}
                                >
                                    {card.icon}
                                </Box>
                                <Stack spacing={0} sx={{ minWidth: 0 }}>
                                    <Typography
                                        variant="caption"
                                        noWrap
                                        sx={{
                                            color: "text.secondary",
                                            fontWeight: 600,
                                            fontSize: { xs: "0.6rem", md: "0.65rem" },
                                            letterSpacing: 0.4,
                                            lineHeight: 1.3,
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        {card.title}
                                    </Typography>
                                    {loading ? (
                                        <Skeleton width={90} height={24} />
                                    ) : (
                                        <Typography
                                            fontWeight={700}
                                            noWrap
                                            sx={{
                                                color: "text.primary",
                                                fontSize: { xs: "0.95rem", sm: "1rem", md: "1.1rem" },
                                                lineHeight: 1.2,
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
                            </Stack>
                        </CardContent>
                    </Card>
                </Box>
            ))}
        </Box>
    );
};
