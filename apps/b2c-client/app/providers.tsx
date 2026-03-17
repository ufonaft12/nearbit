'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  // useState ensures one QueryClient per component tree, not a module singleton,
  // which matters for server rendering and test isolation.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    /*
      attribute="class"  — next-themes adds/removes the "dark" class on <html>
      defaultTheme="system" — respect the OS preference on first load
      disableTransitionOnChange — prevents a flash of unstyled transitions
                                  when switching themes
    */
    <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
