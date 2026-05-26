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

    const renderDot = (props: any) => {
        const { cx, cy, value, index } = props;
        if (value === peakValue && value > 0) {
            return (
                <circle key={`dot-${index}`} cx={cx} cy={cy} r={isMobile ? 4 : 6} fill="#ff4d4f" stroke="#fff" strokeWidth={2} />
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
                        <stop offset="5%" stopColor="#1976d2" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#1976d2" stopOpacity={0.1} />
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
                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    labelStyle={{ fontWeight: 'bold', color: '#333' }}
                    formatter={(value: number | undefined) => [value || 0, 'Приемов']}
                    labelFormatter={(label) => `Время: ${label}`}
                />
                <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#1976d2"
                    strokeWidth={isMobile ? 2 : 3}
                    fillOpacity={1}
                    fill="url(#colorValue)"
                    dot={renderDot}
                    activeDot={{ r: isMobile ? 5 : 8, strokeWidth: 0, fill: '#ff4d4f' }}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
};
