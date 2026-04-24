import { loadAllStats } from '@/lib/stats-data';
import { loadBalanceData, extractCharacters } from '@/lib/patch-data';
import { AdminStatsList } from '@/components/admin/AdminStatsList';

export default async function AdminStatsPage(): Promise<React.JSX.Element> {
  const [entries, balanceData] = await Promise.all([loadAllStats(), loadBalanceData()]);

  const allCharacters = extractCharacters(balanceData);
  const allCharacterNames = [...allCharacters]
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map((c) => c.name);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">실험체 스탯 관리</h1>
        <p className="text-gray-400">
          총 {allCharacterNames.length}명 · 스탯 데이터 있음 {entries.length}명
        </p>
      </div>

      <AdminStatsList entries={entries} allCharacterNames={allCharacterNames} />
    </div>
  );
}
