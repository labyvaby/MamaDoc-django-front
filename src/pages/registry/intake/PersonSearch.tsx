import React from "react";
import { Autocomplete, CircularProgress, TextField, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { searchPatients } from "../../../api/patients";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { formatPhoneDisplay } from "../../../utility/phone";
import { toExistingPerson } from "../registryConstants";
import { formatAge } from "../registryTabs";
import type { ExistingPerson } from "./intakeState";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

interface PersonSearchProps {
  scope: ActiveScope;
  label: string;
  value: ExistingPerson | null;
  onChange: (person: ExistingPerson | null) => void;
  error?: string;
  /** Карточки, которые нельзя выбрать (сам ребёнок в списке представителей). */
  excludeIds?: number[];
}

/** Поиск карточки по ФИО или телефону с задержкой ввода. */
export const PersonSearch: React.FC<PersonSearchProps> = ({ scope, label, value, onChange, error, excludeIds = [] }) => {
  const [input, setInput] = React.useState("");
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input]);

  const search = useQuery({
    queryKey: ["django", "patients", "search", "registry", scope, query],
    queryFn: ({ signal }) => searchPatients(scope, query, 10, signal),
    enabled: query.length >= MIN_QUERY && scope.isReady && scope.orgReady,
    staleTime: 30_000,
  });
  const options = (search.data ?? []).map(toExistingPerson).filter((person) => !excludeIds.includes(person.id));

  return (
    <Autocomplete
      options={value && !options.some((o) => o.id === value.id) ? [value, ...options] : options}
      value={value}
      onChange={(_, next) => onChange(next)}
      inputValue={input}
      onInputChange={(_, next) => setInput(next)}
      filterOptions={(list) => list}
      getOptionLabel={(person) => person.fullName}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      loading={search.isFetching}
      noOptionsText={query.length < MIN_QUERY ? "Введите 2+ символа" : "Не найдено"}
      renderOption={(props, person) => (
        <li {...props} key={person.id}>
          <div>
            <Typography variant="body2">{person.fullName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {formatPhoneDisplay(person.phone)}
              {person.birthDate ? ` · ${formatAge(person.birthDate)}` : ""}
              {person.cardNumber ? ` · № ${person.cardNumber}` : ""}
            </Typography>
          </div>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          label={label}
          error={Boolean(error)}
          helperText={error}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {search.isFetching ? <CircularProgress size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};
