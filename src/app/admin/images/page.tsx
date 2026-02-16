import { CHARACTER_NAME_MAP } from '@/lib/character-names';
import { AdminImageManager } from '@/components/admin/AdminImageManager';

type CharacterEntry = {
  englishName: string;
  koreanName: string;
};

export default function AdminImagesPage(): React.JSX.Element {
  const characters: CharacterEntry[] = Object.entries(CHARACTER_NAME_MAP)
    .map(([englishName, koreanName]) => ({ englishName, koreanName }))
    .sort((a, b) => a.koreanName.localeCompare(b.koreanName, 'ko'));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">이미지 관리</h1>
        <p className="text-gray-400">
          캐릭터 이미지를 업로드하면 Cloudinary에 WebP로 변환 후 저장됩니다.
        </p>
      </div>
      <AdminImageManager characters={characters} />
    </div>
  );
}
