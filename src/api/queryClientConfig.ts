import type { QueryClientConfig } from "@tanstack/react-query";
import { ApiError } from "./client";

// Refine compares this configuration deeply. A new retry function on render
// creates a new QueryClient, leaving mounted queries in the old cache and
// making realtime invalidation miss them. Keep the configuration stable.
export const APP_QUERY_CLIENT_CONFIG: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status === 429) && failureCount < 1,
    },
  },
};
