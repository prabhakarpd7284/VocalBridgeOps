/**
 * Authentication hook
 */

import { useEffect, useCallback, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/client';

// Simple external store for auth state to ensure all hooks share the same state
let authState = !!api.getApiKey();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return authState;
}

function setAuthState(value: boolean) {
  authState = value;
  listeners.forEach((listener) => listener());
}

export function useAuth() {
  const queryClient = useQueryClient();
  const isAuthenticated = useSyncExternalStore(subscribe, getSnapshot);

  const {
    data: tenant,
    isLoading: isTenantLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tenant'],
    queryFn: api.getCurrentTenant,
    enabled: isAuthenticated,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Handle auth errors
  useEffect(() => {
    if (error) {
      api.clearApiKey();
      setAuthState(false);
      queryClient.removeQueries({ queryKey: ['tenant'] });
    }
  }, [error, queryClient]);

  const login = useCallback(async (apiKey: string) => {
    api.setApiKey(apiKey);
    setAuthState(true);

    // Immediately refetch tenant data and wait for it
    try {
      await refetch();
    } catch {
      // Error will be handled by the error effect
    }
  }, [refetch]);

  const logout = useCallback(() => {
    api.clearApiKey();
    queryClient.clear();
    setAuthState(false);
  }, [queryClient]);

  // isLoading should be true only during initial load when we have an API key
  const isLoading = isAuthenticated && isTenantLoading && !tenant;

  return {
    isAuthenticated: isAuthenticated && !!tenant,
    isLoading,
    tenant,
    login,
    logout,
    isAdmin: tenant?.role === 'ADMIN',
  };
}
