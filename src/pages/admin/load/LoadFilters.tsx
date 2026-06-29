import React from 'react';
import { Box, TextField, Autocomplete, Button, ButtonGroup, Paper } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../utility/supabaseClient';
import dayjs, { Dayjs } from 'dayjs';

interface Props {
    selectedEmployees: string[];
    onEmployeesChange: (val: string[]) => void;
    dateRange: [Dayjs | null, Dayjs | null];
    onDateRangeChange: (val: [Dayjs | null, Dayjs | null]) => void;
}

export const LoadFilters: React.FC<Props> = ({ selectedEmployees, onEmployeesChange, dateRange, onDateRangeChange }) => {
    const { data: employees } = useQuery({
        queryKey: ['employeesListAnalytics'],
        queryFn: async () => {
            const { data } = await supabase.from('Employees').select('id, full_name').order('full_name');
            return data || [];
        }
    });

    return (
        <Paper variant="outlined" elevation={0} sx={{ p: 2, borderRadius: "14px" }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Autocomplete
                    multiple
                    options={employees || []}
                    getOptionLabel={(o) => o.full_name || ''}
                    value={employees?.filter((e: any) => selectedEmployees.includes(e.id)) || []}
                    onChange={(_, newValue) => onEmployeesChange(newValue.map(n => n.id))}
                    renderInput={(params) => <TextField {...params} label="Сотрудники" size="small" />}
                    sx={{ width: '100%' }}
                    size="small"
                />

                <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', md: 'row' }, alignItems: { md: 'center' } }}>
                    <Box sx={{ display: 'flex', gap: 1.5, flex: 1 }}>
                        <DatePicker
                            label="Дата начала"
                            value={dateRange[0]}
                            onChange={(d) => onDateRangeChange([d, dateRange[1]])}
                            slotProps={{ textField: { size: 'small', sx: { flex: 1, minWidth: 0 } } }}
                        />
                        <DatePicker
                            label="Дата окончания"
                            value={dateRange[1]}
                            onChange={(d) => onDateRangeChange([dateRange[0], d])}
                            slotProps={{ textField: { size: 'small', sx: { flex: 1, minWidth: 0 } } }}
                        />
                    </Box>

                    <ButtonGroup size="small" variant="outlined" sx={{ flexShrink: 0, width: { xs: '100%', md: 'auto' } }}>
                        <Button
                            onClick={() => onDateRangeChange([dayjs().startOf('day'), dayjs().endOf('day')])}
                            sx={{ flex: { xs: 1, md: 'unset' } }}
                        >
                            Сегодня
                        </Button>
                        <Button
                            onClick={() => onDateRangeChange([dayjs().subtract(7, 'day').startOf('day'), dayjs().endOf('day')])}
                            sx={{ flex: { xs: 1, md: 'unset' } }}
                        >
                            7 Дней
                        </Button>
                    </ButtonGroup>
                </Box>
            </Box>
        </Paper>
    );
};
