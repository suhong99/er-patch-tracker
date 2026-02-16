'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type CharacterEntry = {
  englishName: string;
  koreanName: string;
};

type Props = {
  characters: CharacterEntry[];
};

type ImageMap = Record<string, string>;
type NameMap = Record<string, string>;

export function AdminImageManager({ characters: baseCharacters }: Props): React.JSX.Element {
  const { user } = useAuth();
  const [imageMap, setImageMap] = useState<ImageMap>({});
  const [customCharacters, setCustomCharacters] = useState<NameMap>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);

  // 새 캐릭터 추가 폼
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEnglishName, setNewEnglishName] = useState('');
  const [newKoreanName, setNewKoreanName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // 기존 맵 + 커스텀 캐릭터 합치기
  const allCharacters: CharacterEntry[] = [
    ...baseCharacters,
    ...Object.entries(customCharacters)
      .filter(([en]) => !baseCharacters.some((c) => c.englishName === en))
      .map(([englishName, koreanName]) => ({ englishName, koreanName })),
  ].sort((a, b) => a.koreanName.localeCompare(b.koreanName, 'ko'));

  async function getAuthHeader(): Promise<string> {
    if (!user) throw new Error('로그인이 필요합니다');
    const token = await user.getIdToken();
    return `Bearer ${token}`;
  }

  async function fetchData(): Promise<void> {
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/admin/images', {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) throw new Error('데이터 조회 실패');
      const data = (await res.json()) as { imageMap: ImageMap; customCharacters: NameMap };
      setImageMap(data.imageMap);
      setCustomCharacters(data.customCharacters);
    } catch (err) {
      console.error(err);
      setError('데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }

  function handleUploadClick(englishName: string): void {
    setSelectedCharacter(englishName);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file || !selectedCharacter) return;

    e.target.value = '';
    setUploadingName(selectedCharacter);
    setError(null);

    try {
      const authHeader = await getAuthHeader();

      const formData = new FormData();
      formData.append('englishName', selectedCharacter);
      formData.append('file', file);

      const res = await fetch('/api/admin/images', {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: formData,
      });

      if (!res.ok) throw new Error('이미지 업로드 실패');

      const data = (await res.json()) as { imageUrl: string };
      setImageMap((prev) => ({ ...prev, [selectedCharacter]: data.imageUrl }));
    } catch (err) {
      console.error(err);
      setError(
        `${selectedCharacter} 업로드 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`
      );
    } finally {
      setUploadingName(null);
      setSelectedCharacter(null);
    }
  }

  async function handleAddCharacter(): Promise<void> {
    const trimmedEn = newEnglishName.trim();
    const trimmedKr = newKoreanName.trim();

    if (!trimmedEn || !trimmedKr) {
      setError('영어 이름과 한글 이름을 모두 입력해주세요');
      return;
    }

    if (allCharacters.some((c) => c.englishName === trimmedEn)) {
      setError(`${trimmedEn}은(는) 이미 등록된 캐릭터입니다`);
      return;
    }

    setAdding(true);
    setError(null);

    try {
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/admin/images', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({ englishName: trimmedEn, koreanName: trimmedKr }),
      });

      if (!res.ok) throw new Error('캐릭터 추가 실패');

      setCustomCharacters((prev) => ({ ...prev, [trimmedEn]: trimmedKr }));
      setNewEnglishName('');
      setNewKoreanName('');
      setShowAddForm(false);
      setSuccess(`${trimmedKr}(${trimmedEn}) 추가 완료`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError(`캐릭터 추가 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setAdding(false);
    }
  }

  const filteredCharacters = allCharacters.filter(
    (c) =>
      c.koreanName.includes(searchQuery) ||
      c.englishName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const uploadedCount = Object.keys(imageMap).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    );
  }

  return (
    <div>
      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 상태 바 */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="캐릭터 검색 (한글/영어)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-er-surface border border-er-border rounded-lg text-white placeholder-gray-500 focus:outline-hidden focus:border-violet-500 transition-colors"
          />
        </div>
        <div className="text-sm text-gray-400 shrink-0">
          등록: <span className="text-violet-400 font-medium">{uploadedCount}</span> /{' '}
          {allCharacters.length}
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-2 text-sm rounded bg-violet-600 hover:bg-violet-700 text-white transition-colors shrink-0"
        >
          {showAddForm ? '취소' : '+ 새 캐릭터'}
        </button>
      </div>

      {/* 새 캐릭터 추가 폼 */}
      {showAddForm && (
        <div className="mb-6 p-4 bg-er-surface border border-violet-500/30 rounded-lg">
          <h3 className="text-sm font-medium text-white mb-3">새 캐릭터 추가</h3>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">영어 이름</label>
              <input
                type="text"
                value={newEnglishName}
                onChange={(e) => setNewEnglishName(e.target.value)}
                placeholder="예: Fenrir"
                className="w-full px-3 py-2 bg-gray-800 border border-er-border rounded text-sm text-white placeholder-gray-500 focus:outline-hidden focus:border-violet-500 transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">한글 이름</label>
              <input
                type="text"
                value={newKoreanName}
                onChange={(e) => setNewKoreanName(e.target.value)}
                placeholder="예: 펜리르"
                className="w-full px-3 py-2 bg-gray-800 border border-er-border rounded text-sm text-white placeholder-gray-500 focus:outline-hidden focus:border-violet-500 transition-colors"
              />
            </div>
            <button
              onClick={handleAddCharacter}
              disabled={adding}
              className="px-4 py-2 text-sm rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? '추가 중...' : '추가'}
            </button>
          </div>
        </div>
      )}

      {/* 성공 메시지 */}
      {success && (
        <div className="mb-4 p-3 bg-emerald-600/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">
          {success}
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="mb-4 p-3 bg-rose-600/10 border border-rose-500/30 rounded-lg text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* 캐릭터 그리드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {filteredCharacters.map((character) => {
          const isUploaded = character.englishName in imageMap;
          const isUploading = uploadingName === character.englishName;
          const isCustom = character.englishName in customCharacters;

          return (
            <div
              key={character.englishName}
              className="bg-er-surface border border-er-border rounded-lg p-3 flex flex-col items-center gap-2"
            >
              {/* 이미지 프리뷰 */}
              <div className="w-16 h-20 rounded overflow-hidden bg-gray-800 flex items-center justify-center">
                {isUploaded ? (
                  <img
                    src={imageMap[character.englishName]}
                    alt={character.koreanName}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-2xl text-gray-600">?</span>
                )}
              </div>

              {/* 이름 */}
              <div className="text-center">
                <div className="text-sm font-medium text-white">
                  {character.koreanName}
                  {isCustom && <span className="ml-1 text-xs text-violet-400">*</span>}
                </div>
                <div className="text-xs text-gray-500">{character.englishName}</div>
              </div>

              {/* 상태 뱃지 */}
              {isUploaded ? (
                <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                  등록완료
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-600/20 text-gray-400 border border-gray-500/30">
                  미등록
                </span>
              )}

              {/* 업로드 버튼 */}
              <button
                onClick={() => handleUploadClick(character.englishName)}
                disabled={isUploading}
                className="w-full px-2 py-1.5 text-xs rounded bg-violet-600/20 border border-violet-500/30 text-violet-400 hover:bg-violet-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? '업로드 중...' : isUploaded ? '재업로드' : '업로드'}
              </button>
            </div>
          );
        })}
      </div>

      {filteredCharacters.length === 0 && (
        <div className="text-center py-12 text-gray-500">검색 결과가 없습니다</div>
      )}
    </div>
  );
}
