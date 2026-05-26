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
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { PageHeader } from "../../components/ui";
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
                    elevation={0}
                    sx={{
                        width: '100%',
                        maxWidth: 400,
                        background: `linear-gradient(145deg, ${theme.palette.success.main} 0%, ${theme.palette.success.dark} 100%)`,
                        borderRadius: 6,
                        boxShadow: `0 24px 80px ${alpha(theme.palette.success.main, 0.35)}`,
                        color: 'white',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Background decorations */}
                    <Box sx={{
                        position: 'absolute',
                        top: -80,
                        right: -80,
                        width: 220,
                        height: 220,
                        borderRadius: '50%',
                        background: alpha('#fff', 0.08),
                    }} />
                    <Box sx={{
                        position: 'absolute',
                        bottom: -60,
                        left: -60,
                        width: 180,
                        height: 180,
                        borderRadius: '50%',
                        background: alpha('#fff', 0.05),
                    }} />
                    <Box sx={{
                        position: 'absolute',
                        top: '50%',
                        right: -40,
                        width: 100,
                        height: 100,
                        borderRadius: '50%',
                        background: alpha('#fff', 0.03),
                    }} />

                    <CardContent sx={{ p: 4, position: 'relative', zIndex: 1 }}>
                        {/* Header */}
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                            <Avatar sx={{
                                width: 60,
                                height: 60,
                                bgcolor: alpha('#fff', 0.2),
                                backdropFilter: 'blur(10px)',
                            }}>
                                <AccountBalanceWalletIcon sx={{ fontSize: 30, color: 'white' }} />
                            </Avatar>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                                    Касса
                                </Typography>
                                <Typography variant="body2" sx={{ opacity: 0.7 }}>
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
                                    sx={{ bgcolor: alpha('#fff', 0.2), mx: 'auto' }}
                                />
                            ) : (
                                <Typography variant="h2" fontWeight={900} sx={{
                                    textShadow: '0 4px 20px rgba(0,0,0,0.15)',
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
