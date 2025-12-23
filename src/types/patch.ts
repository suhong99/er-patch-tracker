// 패치 변경 사항 타입
export type ChangeType = 'buff' | 'nerf' | 'mixed';

export type Change = {
  target: string;
  stat: string;
  before: string;
  after: string;
  changeType: ChangeType;
};

export type PatchEntry = {
  patchId: number;
  patchVersion: string;
  patchDate: string;
  overallChange: ChangeType;
  streak: number;
  devComment: string | null;
  changes: Change[];
};

export type CurrentStreak = {
  type: ChangeType | null;
  count: number;
};

export type CharacterStats = {
  totalPatches: number;
  buffCount: number;
  nerfCount: number;
  mixedCount: number;
  currentStreak: CurrentStreak;
  maxBuffStreak: number;
  maxNerfStreak: number;
};

export type Character = {
  name: string;
  stats: CharacterStats;
  patchHistory: PatchEntry[];
};

export type BalanceChangesData = {
  updatedAt: string;
  characters: Record<string, Character>;
};

// 정렬 옵션
export type SortOption = 'name' | 'totalPatches' | 'buffCount' | 'nerfCount' | 'recentPatch';

export type SortDirection = 'asc' | 'desc';

// 필터 옵션
export type FilterOption = 'all' | 'buff' | 'nerf' | 'mixed';
