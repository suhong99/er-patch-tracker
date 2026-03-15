import type { User } from 'firebase/auth';
import type { PatchNote } from '@/types/patch';

export const formatPatchDate = (isoString: string): string => isoString.split('T')[0];

type ParseResult = { id: number } | { error: string };

export const parsePatchId = (input: string): ParseResult => {
  const trimmed = input.trim();
  if (!trimmed) return { error: '패치 ID를 입력해주세요.' };

  const id = parseInt(trimmed, 10);
  if (isNaN(id) || id <= 0) return { error: '유효한 패치 ID를 입력해주세요. (숫자)' };

  return { id };
};

export const fetchRecentPatches = async (user: User): Promise<PatchNote[]> => {
  const token = await user.getIdToken();
  const response = await fetch('/api/admin/patches', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { patches: PatchNote[] };
  return data.patches;
};
