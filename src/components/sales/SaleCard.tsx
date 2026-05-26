
import React from "react";
import { Box, Card, CardContent, Typography, IconButton, Stack, Chip } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { Sale } from "../../services/sales";
import { getSaleStatusConfig, getSaleStatusChipSx } from "../../config/saleStatuses";

interface SaleCardProps {
    sale: Sale;
}

export const SaleCard: React.FC<SaleCardProps> = ({ sale }) => {
    // Show only the first few items or summary
    const displayItems = sale.lines || [];

    return (
        <Card variant="outlined" sx={{ mb: 1.5, borderColor: 'divider', '&:hover': { boxShadow: 1, borderColor: 'primary.light' } }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="column" spacing={1.5}>

                    {/* Header: Status Chip */}
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Chip
                            label={getSaleStatusConfig(sale.status).label}
                            icon={getSaleStatusConfig(sale.status).icon}
                            size="small"
                            sx={getSaleStatusChipSx(sale.status)}
                        />
                        <Typography variant="body2" color="text.secondary">
                            {new Date(sale.created_at).toLocaleDateString('ru-RU')}
                        </Typography>
                    </Stack>

                    {/* Header: Patient + Menu */}
                    {/* Actually reference image shows mostly medicines. 
                       If it's a pharmacy view, listing products is key. 
                       Patient name might be secondary.
                       Let's list products as main content.
                    */}
                    {/* <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Typography variant="subtitle2" fontWeight={600} color="primary">
                            {sale.patient_name}
                        </Typography>
                        <IconButton size="small"><MoreVertIcon fontSize="small"/></IconButton>
                    </Stack> */}

                    {displayItems.map((line) => (
                        <Box key={line.id}>
                            <Stack direction="row" spacing={2} alignItems="center">
                                {/* Image Placeholder or Actual Image */}
                                <Box
                                    component="img"
                                    src={line.product_image || "https://placehold.co/50x50?text=Rx"}
                                    sx={{ width: 48, height: 48, borderRadius: 1, objectFit: 'cover', bgcolor: 'action.hover' }}
                                />

                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body2" fontWeight={600} noWrap>
                                        {line.product_name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {line.quantity} шт × {line.price_at_sale.toLocaleString()} сом
                                    </Typography>
                                </Box>

                                <IconButton size="small" sx={{ alignSelf: 'flex-start', mt: -0.5 }}>
                                    <MoreVertIcon fontSize="small" color="disabled" />
                                </IconButton>
                            </Stack>
                        </Box>
                    ))}

                    {displayItems.length === 0 && (
                        <Typography variant="body2" color="text.secondary">Нет товаров</Typography>
                    )}

                    {/* Footer: Time + Total */}
                    {/* <Divider sx={{ my: 1 }} />
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                             {new Date(sale.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </Typography>
                         <Typography variant="body2" fontWeight={600}>
                            {sale.total_amount?.toLocaleString()} сом
                        </Typography>
                    </Stack> */}
                </Stack>
            </CardContent>
        </Card>
    );
};
