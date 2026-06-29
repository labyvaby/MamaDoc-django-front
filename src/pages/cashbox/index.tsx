import React, { useState, useEffect } from "react";
import {
    Box,
    Card,
    CardContent,
    Typography,
    Avatar,
    useTheme,
    alpha,
    Stack,
    Skeleton
} from "@mui/material";
import { useNotification } from "@refinedev/core";
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import { PageHeader } from "../../components/ui";
import { subtleBg } from "../../theme";
import { usePageTitle } from "../../hooks/usePageTitle";
import { getCashboxSummary, CashboxSummary } from "../../services/cashbox";
import { formatKGS } from "../../utility/format";

const CashboxPage: React.FC = () => {
    usePageTitle("Касса");
    const theme = useTheme();
    const { open: notify } = useNotification();
    const [summary, setSummary] = useState<CashboxSummary | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = React.useCallback(async () => {
        try {
            setLoading(true);
            const sum = await getCashboxSummary();
            setSummary(sum);
        } catch (e) {
            console.error(e);
            notify?.({ type: "error", message: "Ошибка загрузки данных кассы" });
        } finally {
            setLoading(false);
        }
    }, [notify]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <Box
            sx={{
                height: '100%',
                display: "flex",
                flexDirection: "column",
            }}
        >
            <PageHeader
                title="Касса"
                showTitle={false}
                showSearch={false}
            />

            <Box sx={(theme) => ({
                px: theme.appLayout.page.paddingX,
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
            })}>
                <Card
                    variant="outlined"
                    elevation={0}
                    sx={{
                        width: '100%',
                        maxWidth: 400,
                        bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.16 : 0.1),
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    <CardContent sx={{ p: 4, position: 'relative', zIndex: 1 }}>
                        {/* Header */}
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                            <Avatar sx={{
                                width: 60,
                                height: 60,
                                borderRadius: '18px',
                                bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.2 : 0.14),
                                color: 'success.onSurface',
                            }}>
                                <AccountBalanceWalletIcon sx={{ fontSize: 30 }} />
                            </Avatar>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                    Касса
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Баланс наличных
                                </Typography>
                            </Box>
                        </Stack>

                        {/* Main Balance */}
                        <Box sx={{ textAlign: 'center', mb: 4 }}>
                            {loading ? (
                                <Skeleton
                                    variant="text"
                                    width="60%"
                                    height={70}
                                    sx={{ mx: 'auto' }}
                                />
                            ) : (
                                <Typography variant="h2" fontWeight={900} color="success.onSurface" sx={{
                                    letterSpacing: -1,
                                }}>
                                    {formatKGS(summary?.total_cash || 0)}
                                </Typography>
                            )}
                        </Box>
                    </CardContent>
                </Card>
            </Box>
        </Box>
    );
};

export default CashboxPage;
