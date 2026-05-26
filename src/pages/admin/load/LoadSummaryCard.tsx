import React, { useMemo } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SpeedIcon from '@mui/icons-material/Speed';

interface Props {
    data: { time: string; value: number }[];
    totalAppointments: number;
    daysCount: number;
}

export const LoadSummaryCard: React.FC<Props> = ({ data, totalAppointments, daysCount }) => {
    const peak = useMemo(() => {
        if (!data.length) return { time: '-', value: 0 };
        return data.reduce((max, d) => d.value > max.value ? d : max, data[0]);
    }, [data]);

    const averageDaily = Math.round((totalAppointments / daysCount) * 10) / 10;

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: { xs: 'row', md: 'column' },
            gap: 2,
            height: { xs: 'auto', md: '100%' },
        }}>
            <Card elevation={2} sx={{
                borderRadius: 3,
                background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
                color: 'white',
                flex: 1,
            }}>
                <CardContent sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    p: { xs: 1.5, sm: 2 },
                    '&:last-child': { pb: { xs: 1.5, sm: 2 } },
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <SpeedIcon sx={{ fontSize: { xs: 18, sm: 24 } }} />
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ fontSize: { xs: '0.75rem', sm: '1rem' } }}>
                            Пиковое время
                        </Typography>
                    </Box>
                    <Typography fontWeight="bold" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
                        {peak.time}
                    </Typography>
                    <Typography sx={{ opacity: 0.8, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                        {peak.value} приемов
                    </Typography>
                </CardContent>
            </Card>

            <Card elevation={2} sx={{ borderRadius: 3, flex: 1 }}>
                <CardContent sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    p: { xs: 1.5, sm: 2 },
                    '&:last-child': { pb: { xs: 1.5, sm: 2 } },
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, color: 'text.secondary' }}>
                        <AssessmentIcon sx={{ fontSize: { xs: 18, sm: 24 } }} />
                        <Typography variant="subtitle2" fontWeight="bold" sx={{ fontSize: { xs: '0.75rem', sm: '1rem' }, lineHeight: 1.2 }}>
                            В среднем за день
                        </Typography>
                    </Box>
                    <Typography fontWeight="bold" color="primary" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
                        {averageDaily}
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                        За {daysCount} дн. (Всего: {totalAppointments})
                    </Typography>
                </CardContent>
            </Card>
        </Box>
    );
};
