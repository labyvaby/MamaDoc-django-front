
import React from 'react';
import {
    Box,
    Typography,
    Paper,
    List,
    ListItemButton,
    Avatar,
    Tooltip,
    Chip,
    Stack,
    alpha
} from '@mui/material';
import { Sale } from '../../services/sales';
import { InventoryOutlined as Inventory, MedicalServicesOutlined as MedicalServices } from '@mui/icons-material';
import { formatKGS } from '../../utility/format';
import { getSaleStatusConfig, getSaleStatusChipSx } from '../../config/saleStatuses';

const getDiscountPercent = (comment?: string | null): number => {
    if (!comment) return 0;
    const m = comment.match(/Скидка\s+(\d+)%/);
    return m ? Number(m[1]) : 0;
};

interface SalesListProps {
    sales: Sale[];
    selectedSale: Sale | null;
    onSelect: (sale: Sale) => void;
    loading: boolean;
    loadMoreRef?: React.Ref<HTMLDivElement>;
    loadingMore?: boolean;
}

export const SalesList: React.FC<SalesListProps> = ({ sales, selectedSale, onSelect, loading, loadMoreRef, loadingMore }) => {

    if (loading && sales.length === 0) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    Загрузка...
                </Typography>
            </Box>
        );
    }

    if (sales.length === 0) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    Нет продаж
                </Typography>
            </Box>
        );
    }

    return (
        <Paper
            elevation={0}
            variant="outlined"
            sx={{
                height: { xs: 'auto', md: '100%' },
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Список продаж ({sales.length})
                </Typography>
            </Box>
            <Box
                sx={{
                    overflowY: 'auto',
                    flex: 1,
                    pb: 2,
                }}
            >
                <List sx={{ py: 0.5 }}>
                    {sales.map((sale) => {
                        const discountPct = sale.status === 'paid' ? getDiscountPercent(sale.comment) : 0;
                        const displayStatus = discountPct > 0 ? 'discounted' : sale.status;
                        const statusConfig = getSaleStatusConfig(displayStatus);
                        const chipLabel = discountPct > 0
                            ? `Со скидкой ${discountPct}%`
                            : statusConfig.label;

                        return (
                            <ListItemButton
                                key={sale.id}
                                sx={{
                                    px: 2,
                                    py: 1.5,
                                    bgcolor: selectedSale?.id === sale.id ? 'action.selected' : 'transparent',
                                    '&:hover': { bgcolor: 'action.hover' },
                                    borderBottom: 1,
                                    borderColor: 'divider',
                                }}
                                onClick={() => onSelect(sale)}
                            >
                                <Avatar
                                    variant="rounded"
                                    src={sale.lines?.[0]?.product_image || undefined}
                                    sx={{ mr: 2, width: 40, height: 40, bgcolor: 'action.selected', color: 'text.secondary' }}
                                >
                                    {sale.source === 'appointment' ? <MedicalServices /> : <Inventory />}
                                </Avatar>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body1" sx={{ fontWeight: 500 }} noWrap>
                                        {sale.lines?.map(l => l.product_name).filter(Boolean).join(', ') || 'Товар удален'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" noWrap>
                                        {sale.patient_name || 'Анонимный'}
                                    </Typography>
                                </Box>
                                <Stack alignItems="flex-end" spacing={0.5}>
                                    <Stack direction="row" spacing={0.5}>
                                        {sale.source === 'appointment' && (
                                            <Chip
                                                label="Из приёма"
                                                size="small"
                                                sx={(theme) => ({
                                                    height: '22px',
                                                    fontSize: '0.7rem',
                                                    borderRadius: '7px',
                                                    bgcolor: alpha(theme.palette.purple.main, theme.palette.mode === 'dark' ? 0.2 : 0.1),
                                                    color: 'purple.onSurface',
                                                    fontWeight: 500,
                                                })}
                                            />
                                        )}
                                        <Chip
                                            label={chipLabel}
                                            icon={statusConfig.icon}
                                            size="small"
                                            sx={getSaleStatusChipSx(displayStatus)}
                                        />
                                    </Stack>
                                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                        {formatKGS(sale.total_amount ?? 0)}
                                    </Typography>
                                </Stack>
                            </ListItemButton>
                        );
                    })}
                </List>
                {loadMoreRef && <Box ref={loadMoreRef} sx={{ height: 1 }} />}
                {loadingMore && (
                    <Box sx={{ py: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                            Загрузка...
                        </Typography>
                    </Box>
                )}
            </Box>
        </Paper>
    );
};
