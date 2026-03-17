'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  // useState ensures one QueryClient per component tree, not a module singleton,
  // which matters for server rendering and test isolation.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Search results don't change under our feet — 5 min stale time means
            // re-searching the same term is instant (served from cache).
            staleTime: 1000 * 60 * 5,
            // One retry is enough; a failing embedding call won't fix itself on retry.
            retry: 1,
            // Don't re-fetch when the window is re-focused — no background polling needed.
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
