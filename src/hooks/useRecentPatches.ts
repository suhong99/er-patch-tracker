'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchRecentPatches } from '@/lib/patch-api';
import type { PatchNote } from '@/types/patch';

type UseRecentPatchesResult = {
  patches: PatchNote[];
  loading: boolean;
};

export function useRecentPatches(): UseRecentPatchesResult {
  const { user } = useAuth();
  const [patches, setPatches] = useState<PatchNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    fetchRecentPatches(user)
      .then(setPatches)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  return { patches, loading };
}
