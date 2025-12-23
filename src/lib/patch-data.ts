import { promises as fs } from 'fs';
import path from 'path';
import type { BalanceChangesData, Character } from '@/types/patch';

// 서버 전용 - 데이터 파일 경로
const DATA_PATH = path.join(process.cwd(), 'data', 'balance-changes.json');

// 순수 함수: 데이터 로드 (서버 전용)
export const loadBalanceData = async (): Promise<BalanceChangesData> => {
  const fileContent = await fs.readFile(DATA_PATH, 'utf-8');
  return JSON.parse(fileContent) as BalanceChangesData;
};

// 순수 함수: 캐릭터 목록 추출
export const extractCharacters = (data: BalanceChangesData): Character[] =>
  Object.values(data.characters);

// 순수 함수: 캐릭터 이름으로 찾기
export const findCharacterByName = (
  characters: Character[],
  name: string
): Character | undefined =>
  characters.find(
    (char) => char.name === name || encodeURIComponent(char.name) === name
  );

// 순수 함수: 통계 요약 계산
export const calculateStatsSummary = (
  characters: Character[]
): {
  totalCharacters: number;
  avgPatches: number;
  mostBuffed: Character | null;
  mostNerfed: Character | null;
} => {
  const totalCharacters = characters.length;

  const avgPatches =
    totalCharacters > 0
      ? characters.reduce((sum, char) => sum + char.stats.totalPatches, 0) /
        totalCharacters
      : 0;

  const mostBuffed = characters.reduce<Character | null>(
    (max, char) =>
      !max || char.stats.buffCount > max.stats.buffCount ? char : max,
    null
  );

  const mostNerfed = characters.reduce<Character | null>(
    (max, char) =>
      !max || char.stats.nerfCount > max.stats.nerfCount ? char : max,
    null
  );

  return { totalCharacters, avgPatches, mostBuffed, mostNerfed };
};

// 순수 함수: 모든 캐릭터 이름 추출 (검색 자동완성용)
export const getAllCharacterNames = (characters: Character[]): string[] =>
  characters.map((char) => char.name).sort((a, b) => a.localeCompare(b, 'ko'));

// 클라이언트 공용 유틸리티 재export
export {
  filterAndSortCharacters,
  getChangeTypeLabel,
  getChangeTypeColor,
  getChangeTypeBgColor,
  formatDate,
} from './patch-utils';
