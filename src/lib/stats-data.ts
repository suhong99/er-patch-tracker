import { unstable_cache } from 'next/cache';
import { db } from './firebase-admin';
import type { BaseStats, WeaponStat } from '@/types/patch';

export type CharacterStatEntry = {
  name: string;
  baseStats: BaseStats;
};

export type StatKey =
  | 'hp'
  | 'attack'
  | 'defense'
  | 'moveSpeed'
  | 'attackSpeed'
  | 'hpRegen'
  | 'hp20'
  | 'attack20'
  | 'defense20'
  | 'hpRegen20'
  | 'attackSpeedGrowth'
  | 'basicAttackAmpGrowth'
  | 'skillAmpGrowth';

export type WeaponStatKey = 'attackSpeedGrowth' | 'basicAttackAmpGrowth' | 'skillAmpGrowth';

export type WeaponStatEntry = {
  characterName: string;
  weaponType: string;
  value: number;
};

export type StatSection = 'base' | 'lv20' | 'weapon';

export type StatComponents = {
  base: number | null;
  growth: number | null;
  formatBase: (v: number) => string;
  formatGrowth: (v: number) => string;
};

export type StatConfig = {
  key: StatKey;
  label: string;
  description: string;
  section: StatSection;
  barClass: string;
  textClass: string;
  bgClass: string;
  getValue: (stats: BaseStats) => number | null;
  getGrowth: (stats: BaseStats) => number | null;
  getComponents?: (stats: BaseStats) => StatComponents;
  formatValue: (v: number) => string;
  weaponStatKey?: WeaponStatKey;
};

const defaultFormat = (v: number): string => String(v);
const decimalFormat = (v: number): string => v.toFixed(2);
const percentFormat = (v: number): string => `${v}%`;
// Lv.20 스탯 포맷: 소수점이 있으면 1자리, 정수면 한국 표기
const lv20Format = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? r.toLocaleString('ko-KR') : r.toFixed(1);
};

const lv20 = (base: number | null, growth: number | null): number | null =>
  base !== null && growth !== null ? base + growth * 19 : null;

const getMaxWeaponStat = (
  weaponStats: WeaponStat[],
  key: keyof Pick<WeaponStat, 'attackSpeedGrowth' | 'basicAttackAmpGrowth' | 'skillAmpGrowth'>
): number | null => {
  const values = weaponStats.map((ws) => ws[key]).filter((v): v is number => v !== null);
  return values.length > 0 ? Math.max(...values) : null;
};

export const STAT_CATEGORIES: StatConfig[] = [
  // ── 기본 스텟 (Lv.1) ─────────────────────────
  {
    key: 'hp',
    label: '체력',
    description: '레벨 1 기본 체력',
    section: 'base',
    barClass: 'from-emerald-500 to-emerald-400',
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    getValue: (s) => s.hpBase,
    getGrowth: (s) => s.hpGrowth,
    formatValue: defaultFormat,
  },
  {
    key: 'attack',
    label: '공격력',
    description: '레벨 1 기본 공격력',
    section: 'base',
    barClass: 'from-rose-500 to-rose-400',
    textClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    getValue: (s) => s.attackBase,
    getGrowth: (s) => s.attackGrowth,
    formatValue: defaultFormat,
  },
  {
    key: 'defense',
    label: '방어력',
    description: '레벨 1 기본 방어력',
    section: 'base',
    barClass: 'from-sky-500 to-sky-400',
    textClass: 'text-sky-400',
    bgClass: 'bg-sky-500/10',
    getValue: (s) => s.defenseBase,
    getGrowth: (s) => s.defenseGrowth,
    formatValue: defaultFormat,
  },
  {
    key: 'moveSpeed',
    label: '이동속도',
    description: '기본 이동속도',
    section: 'base',
    barClass: 'from-amber-500 to-amber-400',
    textClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    getValue: (s) => s.moveSpeed,
    getGrowth: () => null,
    formatValue: defaultFormat,
  },
  {
    key: 'attackSpeed',
    label: '공격속도',
    description: '레벨 1 기본 공격속도',
    section: 'base',
    barClass: 'from-violet-500 to-violet-400',
    textClass: 'text-violet-400',
    bgClass: 'bg-violet-500/10',
    getValue: (s) => s.attackSpeedBase,
    getGrowth: () => null,
    formatValue: decimalFormat,
  },
  {
    key: 'hpRegen',
    label: '체력 재생',
    description: '레벨 1 기본 체력 재생',
    section: 'base',
    barClass: 'from-green-500 to-green-400',
    textClass: 'text-green-400',
    bgClass: 'bg-green-500/10',
    getValue: (s) => s.hpRegenBase,
    getGrowth: (s) => s.hpRegenGrowth,
    formatValue: decimalFormat,
  },
  // ── 레벨 20 최종 스텟 ─────────────────────────
  {
    key: 'hp20',
    label: '체력 (Lv.20)',
    description: '레벨 20 최대 체력 · 기본 + 성장 × 19',
    section: 'lv20',
    barClass: 'from-teal-500 to-teal-400',
    textClass: 'text-teal-400',
    bgClass: 'bg-teal-500/10',
    getValue: (s) => lv20(s.hpBase, s.hpGrowth),
    getGrowth: () => null,
    getComponents: (s) => ({
      base: s.hpBase,
      growth: s.hpGrowth,
      formatBase: defaultFormat,
      formatGrowth: defaultFormat,
    }),
    formatValue: lv20Format,
  },
  {
    key: 'attack20',
    label: '공격력 (Lv.20)',
    description: '레벨 20 최대 공격력 · 기본 + 성장 × 19',
    section: 'lv20',
    barClass: 'from-pink-500 to-pink-400',
    textClass: 'text-pink-400',
    bgClass: 'bg-pink-500/10',
    getValue: (s) => lv20(s.attackBase, s.attackGrowth),
    getGrowth: () => null,
    getComponents: (s) => ({
      base: s.attackBase,
      growth: s.attackGrowth,
      formatBase: defaultFormat,
      formatGrowth: defaultFormat,
    }),
    formatValue: lv20Format,
  },
  {
    key: 'defense20',
    label: '방어력 (Lv.20)',
    description: '레벨 20 최대 방어력 · 기본 + 성장 × 19',
    section: 'lv20',
    barClass: 'from-blue-500 to-blue-400',
    textClass: 'text-blue-400',
    bgClass: 'bg-blue-500/10',
    getValue: (s) => lv20(s.defenseBase, s.defenseGrowth),
    getGrowth: () => null,
    getComponents: (s) => ({
      base: s.defenseBase,
      growth: s.defenseGrowth,
      formatBase: defaultFormat,
      formatGrowth: defaultFormat,
    }),
    formatValue: lv20Format,
  },
  {
    key: 'hpRegen20',
    label: '체력 재생 (Lv.20)',
    description: '레벨 20 체력 재생 · 기본 + 성장 × 19',
    section: 'lv20',
    barClass: 'from-lime-500 to-lime-400',
    textClass: 'text-lime-400',
    bgClass: 'bg-lime-500/10',
    getValue: (s) => lv20(s.hpRegenBase, s.hpRegenGrowth),
    getGrowth: () => null,
    getComponents: (s) => ({
      base: s.hpRegenBase,
      growth: s.hpRegenGrowth,
      formatBase: decimalFormat,
      formatGrowth: decimalFormat,
    }),
    formatValue: lv20Format,
  },
  // ── 무기 성장치 (캐릭터 × 무기군 조합 랭킹) ──
  {
    key: 'attackSpeedGrowth',
    label: '공속 성장',
    description: '캐릭터 × 무기군 조합 공격속도 성장치 순위',
    section: 'weapon',
    barClass: 'from-purple-500 to-purple-400',
    textClass: 'text-purple-400',
    bgClass: 'bg-purple-500/10',
    getValue: (s) => getMaxWeaponStat(s.weaponStats, 'attackSpeedGrowth'),
    getGrowth: () => null,
    formatValue: percentFormat,
    weaponStatKey: 'attackSpeedGrowth',
  },
  {
    key: 'basicAttackAmpGrowth',
    label: '기공 증폭',
    description: '캐릭터 × 무기군 조합 기본공격 증폭 성장치 순위',
    section: 'weapon',
    barClass: 'from-cyan-500 to-cyan-400',
    textClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/10',
    getValue: (s) => getMaxWeaponStat(s.weaponStats, 'basicAttackAmpGrowth'),
    getGrowth: () => null,
    formatValue: percentFormat,
    weaponStatKey: 'basicAttackAmpGrowth',
  },
  {
    key: 'skillAmpGrowth',
    label: '스킬 증폭',
    description: '캐릭터 × 무기군 조합 스킬 증폭 성장치 순위',
    section: 'weapon',
    barClass: 'from-orange-500 to-orange-400',
    textClass: 'text-orange-400',
    bgClass: 'bg-orange-500/10',
    getValue: (s) => getMaxWeaponStat(s.weaponStats, 'skillAmpGrowth'),
    getGrowth: () => null,
    formatValue: percentFormat,
    weaponStatKey: 'skillAmpGrowth',
  },
];

export const STAT_SECTIONS: { key: StatSection; label: string }[] = [
  { key: 'base', label: '기본' },
  { key: 'lv20', label: 'Lv.20' },
  { key: 'weapon', label: '무기 성장' },
];

// 캐릭터 × 무기군 조합 랭킹 (내림차순)
export const getWeaponStatRanking = (
  entries: CharacterStatEntry[],
  key: WeaponStatKey
): WeaponStatEntry[] => {
  const result: WeaponStatEntry[] = [];
  for (const entry of entries) {
    for (const ws of entry.baseStats.weaponStats) {
      const value = ws[key];
      if (value !== null) {
        result.push({ characterName: entry.name, weaponType: ws.weaponType, value });
      }
    }
  }
  return result.sort((a, b) => b.value - a.value);
};

const competitionRank = (sortedValues: number[], idx: number): number => {
  const target = sortedValues[idx];
  return sortedValues.findIndex((v) => v === target) + 1;
};

// 캐릭터의 최고 순위 (무기군 중 가장 높은 값 기준)
export const getCharacterWeaponRank = (
  weaponRanking: WeaponStatEntry[],
  characterName: string
): { rank: number; total: number } | undefined => {
  const idx = weaponRanking.findIndex((e) => e.characterName === characterName);
  if (idx === -1) return undefined;
  const rank = competitionRank(
    weaponRanking.map((e) => e.value),
    idx
  );
  return { rank, total: weaponRanking.length };
};

// 특정 캐릭터 × 무기군 조합의 순위
export const getRankForWeaponCombo = (
  weaponRanking: WeaponStatEntry[],
  characterName: string,
  weaponType: string
): { rank: number; total: number } | null => {
  const idx = weaponRanking.findIndex(
    (e) => e.characterName === characterName && e.weaponType === weaponType
  );
  if (idx === -1) return null;
  const rank = competitionRank(
    weaponRanking.map((e) => e.value),
    idx
  );
  return { rank, total: weaponRanking.length };
};

export const findStatConfig = (key: string | undefined): StatConfig =>
  STAT_CATEGORIES.find((c) => c.key === key) ?? STAT_CATEGORIES[0];

export const getRankings = (
  entries: CharacterStatEntry[],
  config: StatConfig
): Map<string, { rank: number; total: number }> => {
  const valid = entries
    .filter((e) => config.getValue(e.baseStats) !== null)
    .sort((a, b) => (config.getValue(b.baseStats) ?? 0) - (config.getValue(a.baseStats) ?? 0));

  const map = new Map<string, { rank: number; total: number }>();
  valid.forEach((e, i) => {
    const value = config.getValue(e.baseStats) ?? 0;
    const prevValue = i > 0 ? (config.getValue(valid[i - 1].baseStats) ?? 0) : null;
    const rank =
      prevValue !== null && value === prevValue ? map.get(valid[i - 1].name)!.rank : i + 1;
    map.set(e.name, { rank, total: valid.length });
  });
  return map;
};

const fetchAllStats = async (): Promise<CharacterStatEntry[]> => {
  const snapshot = await db.collection('characters').get();
  const results: CharacterStatEntry[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.baseStats) {
      results.push({
        name: data.name as string,
        baseStats: data.baseStats as BaseStats,
      });
    }
  });

  return results.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
};

export const loadAllStats = unstable_cache(fetchAllStats, ['character-stats'], {
  revalidate: 3600,
  tags: ['character-stats'],
});
