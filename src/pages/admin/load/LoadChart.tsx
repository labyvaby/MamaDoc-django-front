import React, { useMemo } from 'react';
import { useTheme, useMediaQuery } from '@mui/material';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface Props {
    data: { time: string; value: number }[];
}

export const LoadChart: React.FC<Props> = ({ data }) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const peakValue = useMemo(() => {
        if (!data.length) return 0;
        return Math.max(...data.map(d => d.value));
    }, [data]);

    const primaryColor = theme.palette.primary.main;
    const peakColor = theme.palette.error.main;

    const renderDot = (props: any) => {
        const { cx, cy, value, index } = props;
        if (value === peakValue && value > 0) {
            return (
                <circle key={`dot-${index}`} cx={cx} cy={cy} r={isMobile ? 4 : 6} fill={peakColor} stroke={theme.palette.background.paper} strokeWidth={2} />
            );
        }
        return null;
    };

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart
                data={data}
                margin={{
                    top: 16,
                    right: isMobile ? 8 : 30,
                    left: isMobile ? -20 : 0,
                    bottom: 0,
                }}
            >
                <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={primaryColor} stopOpacity={0.8} />
                        <stop offset="95%" stopColor={primaryColor} stopOpacity={0.1} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis
                    dataKey="time"
                    minTickGap={isMobile ? 30 : 20}
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    interval={isMobile ? 3 : 'preserveStartEnd'}
                />
                <YAxis
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    allowDecimals={false}
                    width={isMobile ? 28 : 40}
                />
                <Tooltip
                    contentStyle={{
                        borderRadius: 10,
                        border: `1px solid ${theme.palette.divider}`,
                        backgroundColor: theme.palette.background.paper,
                        color: theme.palette.text.primary,
                    }}
                    labelStyle={{ fontWeight: 'bold', color: theme.palette.text.primary }}
                    itemStyle={{ color: theme.palette.text.secondary }}
                    formatter={(value: number | undefined) => [value || 0, 'Приемов']}
                    labelFormatter={(label) => `Время: ${label}`}
                />
                <Area
                    type="monotone"
                    dataKey="value"
                    stroke={primaryColor}
                    strokeWidth={isMobile ? 2 : 3}
                    fillOpacity={1}
                    fill="url(#colorValue)"
                    dot={renderDot}
                    activeDot={{ r: isMobile ? 5 : 8, strokeWidth: 0, fill: peakColor }}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
};
