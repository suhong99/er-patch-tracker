import { loadBalanceData, extractCharacters } from '@/lib/patch-data';
import { AdminCharacterList } from '@/components/admin/AdminCharacterList';

export default async function AdminDashboardPage(): Promise<React.JSX.Element> {
  const balanceData = await loadBalanceData();
  const characters = extractCharacters(balanceData);

  // 이름순 정렬
  const sortedCharacters = [...characters].sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">캐릭터 패치 데이터 관리</h1>
        <p className="text-gray-400">
          수정할 캐릭터를 선택하세요. 총 {characters.length}명의 캐릭터가 있습니다.
        </p>
      </div>

      <AdminCharacterList characters={sortedCharacters} />
    </div>
  );
}
