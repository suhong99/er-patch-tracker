'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import type { BaseStats, WeaponStat } from '@/types/patch';

const WEAPON_TYPES = [
  'VF의수',
  '권총',
  '글러브',
  '기타',
  '단검',
  '도끼',
  '돌격 소총',
  '레이피어',
  '망치',
  '방망이',
  '석궁',
  '쌍검',
  '쌍절곤',
  '아르카나',
  '암기',
  '양손검',
  '저격총',
  '창',
  '채찍',
  '카메라',
  '톤파',
  '투척',
  '활',
] as const;

type CharacterStatEditorProps = {
  characterName: string;
  initialStats: BaseStats | null;
};

type BaseStatField = {
  key: keyof Omit<BaseStats, 'weaponStats' | 'crawledAt'>;
  label: string;
  placeholder: string;
  step?: string;
};

const BASE_STAT_FIELDS: BaseStatField[] = [
  { key: 'hpBase', label: '체력 기본', placeholder: '850' },
  { key: 'hpGrowth', label: '체력 성장', placeholder: '40' },
  { key: 'hpRegenBase', label: '체력 재생 기본', placeholder: '2.5', step: '0.01' },
  { key: 'hpRegenGrowth', label: '체력 재생 성장', placeholder: '0.1', step: '0.01' },
  { key: 'defenseBase', label: '방어력 기본', placeholder: '20' },
  { key: 'defenseGrowth', label: '방어력 성장', placeholder: '3' },
  { key: 'attackBase', label: '공격력 기본', placeholder: '55' },
  { key: 'attackGrowth', label: '공격력 성장', placeholder: '3' },
  { key: 'attackSpeedBase', label: '공격속도 기본', placeholder: '1.00', step: '0.01' },
  { key: 'moveSpeed', label: '이동속도', placeholder: '350' },
];

const parseNum = (v: string): number | null => {
  if (v === '' || v === null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

const formatVal = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : String(v);

type WeaponStatEditState = {
  attackSpeedGrowth: string;
  basicAttackAmpGrowth: string;
  skillAmpGrowth: string;
};

export function CharacterStatEditor({
  characterName,
  initialStats,
}: CharacterStatEditorProps): React.JSX.Element {
  const { user } = useAuth();

  const initBase = (): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const f of BASE_STAT_FIELDS) {
      result[f.key] = formatVal(initialStats?.[f.key] as number | null);
    }
    return result;
  };

  const [baseValues, setBaseValues] = useState<Record<string, string>>(initBase);
  const [baseSaving, setBaseSaving] = useState(false);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [baseSuccess, setBaseSuccess] = useState(false);

  const [weaponStats, setWeaponStats] = useState<WeaponStat[]>(initialStats?.weaponStats ?? []);
  const [editingWeapon, setEditingWeapon] = useState<string | null>(null);
  const [weaponEditValues, setWeaponEditValues] = useState<WeaponStatEditState>({
    attackSpeedGrowth: '',
    basicAttackAmpGrowth: '',
    skillAmpGrowth: '',
  });
  const [weaponSaving, setWeaponSaving] = useState(false);
  const [weaponError, setWeaponError] = useState<string | null>(null);

  const [deletingWeapon, setDeletingWeapon] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [newWeaponType, setNewWeaponType] = useState('');
  const [newWeaponValues, setNewWeaponValues] = useState<WeaponStatEditState>({
    attackSpeedGrowth: '',
    basicAttackAmpGrowth: '',
    skillAmpGrowth: '',
  });
  const [addingWeapon, setAddingWeapon] = useState(false);
  const [addWeaponError, setAddWeaponError] = useState<string | null>(null);
  const [showAddWeapon, setShowAddWeapon] = useState(false);

  const getToken = async (): Promise<string | undefined> => user?.getIdToken();

  const handleBaseSave = async (): Promise<void> => {
    try {
      setBaseSaving(true);
      setBaseError(null);
      setBaseSuccess(false);

      const token = await getToken();
      const body: Record<string, number | null> = {};
      for (const f of BASE_STAT_FIELDS) {
        body[f.key] = parseNum(baseValues[f.key]);
      }

      const res = await fetch(`/api/admin/characters/${encodeURIComponent(characterName)}/stats`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setBaseError(data.error ?? '저장 실패');
        return;
      }
      setBaseSuccess(true);
      setTimeout(() => setBaseSuccess(false), 3000);
    } catch {
      setBaseError('저장 중 오류가 발생했습니다.');
    } finally {
      setBaseSaving(false);
    }
  };

  const startEditWeapon = (ws: WeaponStat): void => {
    setEditingWeapon(ws.weaponType);
    setWeaponEditValues({
      attackSpeedGrowth: formatVal(ws.attackSpeedGrowth),
      basicAttackAmpGrowth: formatVal(ws.basicAttackAmpGrowth),
      skillAmpGrowth: formatVal(ws.skillAmpGrowth),
    });
    setWeaponError(null);
  };

  const cancelEditWeapon = (): void => {
    setEditingWeapon(null);
    setWeaponError(null);
  };

  const handleWeaponSave = async (weaponType: string): Promise<void> => {
    try {
      setWeaponSaving(true);
      setWeaponError(null);

      const token = await getToken();
      const res = await fetch(
        `/api/admin/characters/${encodeURIComponent(characterName)}/stats/weapons/${encodeURIComponent(weaponType)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            attackSpeedGrowth: parseNum(weaponEditValues.attackSpeedGrowth),
            basicAttackAmpGrowth: parseNum(weaponEditValues.basicAttackAmpGrowth),
            skillAmpGrowth: parseNum(weaponEditValues.skillAmpGrowth),
          }),
        }
      );

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setWeaponError(data.error ?? '저장 실패');
        return;
      }

      setWeaponStats((prev) =>
        prev.map((w) =>
          w.weaponType === weaponType
            ? {
                ...w,
                attackSpeedGrowth: parseNum(weaponEditValues.attackSpeedGrowth),
                basicAttackAmpGrowth: parseNum(weaponEditValues.basicAttackAmpGrowth),
                skillAmpGrowth: parseNum(weaponEditValues.skillAmpGrowth),
              }
            : w
        )
      );
      setEditingWeapon(null);
    } catch {
      setWeaponError('저장 중 오류가 발생했습니다.');
    } finally {
      setWeaponSaving(false);
    }
  };

  const handleWeaponDelete = async (): Promise<void> => {
    if (!deletingWeapon) return;
    try {
      setIsDeleting(true);

      const token = await getToken();
      const res = await fetch(
        `/api/admin/characters/${encodeURIComponent(characterName)}/stats/weapons/${encodeURIComponent(deletingWeapon)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        setWeaponStats((prev) => prev.filter((w) => w.weaponType !== deletingWeapon));
      }
      setDeletingWeapon(null);
    } catch {
      /* empty */
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddWeapon = async (): Promise<void> => {
    if (!newWeaponType) {
      setAddWeaponError('무기 타입을 선택하세요.');
      return;
    }
    try {
      setAddingWeapon(true);
      setAddWeaponError(null);

      const token = await getToken();
      const res = await fetch(
        `/api/admin/characters/${encodeURIComponent(characterName)}/stats/weapons`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            weaponType: newWeaponType,
            attackSpeedGrowth: parseNum(newWeaponValues.attackSpeedGrowth),
            basicAttackAmpGrowth: parseNum(newWeaponValues.basicAttackAmpGrowth),
            skillAmpGrowth: parseNum(newWeaponValues.skillAmpGrowth),
          }),
        }
      );

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setAddWeaponError(data.error ?? '저장 실패');
        return;
      }

      setWeaponStats((prev) => [
        ...prev,
        {
          weaponType: newWeaponType,
          attackSpeedGrowth: parseNum(newWeaponValues.attackSpeedGrowth),
          basicAttackAmpGrowth: parseNum(newWeaponValues.basicAttackAmpGrowth),
          skillAmpGrowth: parseNum(newWeaponValues.skillAmpGrowth),
        },
      ]);
      setNewWeaponType('');
      setNewWeaponValues({ attackSpeedGrowth: '', basicAttackAmpGrowth: '', skillAmpGrowth: '' });
      setShowAddWeapon(false);
    } catch {
      setAddWeaponError('저장 중 오류가 발생했습니다.');
    } finally {
      setAddingWeapon(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 기본 스탯 섹션 */}
      <section className="bg-er-surface border border-er-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">기본 스탯</h2>
          {baseSuccess && <span className="text-sm text-emerald-400">저장 완료</span>}
        </div>

        {baseError && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm">
            {baseError}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          {BASE_STAT_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
              <input
                type="number"
                value={baseValues[f.key]}
                onChange={(e) => setBaseValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                step={f.step ?? '1'}
                className="w-full px-3 py-2 bg-er-surface-dark border border-er-border rounded-lg text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-violet-500"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleBaseSave}
            disabled={baseSaving}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-800 text-white rounded-lg text-sm transition-colors"
          >
            {baseSaving ? '저장 중...' : '기본 스탯 저장'}
          </button>
        </div>
      </section>

      {/* 무기 스탯 섹션 */}
      <section className="bg-er-surface border border-er-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">무기 역할군 스탯</h2>
          <button
            onClick={() => {
              setShowAddWeapon((v) => !v);
              setAddWeaponError(null);
            }}
            className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            {showAddWeapon ? '닫기' : '+ 추가'}
          </button>
        </div>

        {weaponError && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm">
            {weaponError}
          </div>
        )}

        {/* 무기 추가 폼 */}
        {showAddWeapon && (
          <div className="mb-4 p-4 bg-er-surface-dark border border-violet-500/30 rounded-lg">
            <h3 className="text-sm font-medium text-gray-300 mb-3">무기 추가</h3>
            {addWeaponError && (
              <div className="mb-3 p-2 bg-rose-500/10 border border-rose-500/30 rounded text-rose-400 text-xs">
                {addWeaponError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">무기 타입 *</label>
                <select
                  value={newWeaponType}
                  onChange={(e) => setNewWeaponType(e.target.value)}
                  className="w-full px-3 py-2 bg-er-surface border border-er-border rounded-lg text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">선택...</option>
                  {WEAPON_TYPES.filter((wt) => !weaponStats.some((w) => w.weaponType === wt)).map(
                    (wt) => (
                      <option key={wt} value={wt}>
                        {wt}
                      </option>
                    )
                  )}
                </select>
              </div>
              {(
                [
                  { field: 'attackSpeedGrowth', label: '공속 성장 (%)' },
                  { field: 'basicAttackAmpGrowth', label: '기공 증폭 성장 (%)' },
                  { field: 'skillAmpGrowth', label: '스킬 증폭 성장 (%)' },
                ] as const
              ).map(({ field, label }) => (
                <div key={field}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input
                    type="number"
                    value={newWeaponValues[field]}
                    onChange={(e) =>
                      setNewWeaponValues((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                    step="any"
                    className="w-full px-3 py-2 bg-er-surface border border-er-border rounded-lg text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAddWeapon(false);
                  setAddWeaponError(null);
                }}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddWeapon}
                disabled={addingWeapon}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-800 text-white rounded text-sm transition-colors"
              >
                {addingWeapon ? '추가 중...' : '추가'}
              </button>
            </div>
          </div>
        )}

        {weaponStats.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">무기 스탯 데이터가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {weaponStats.map((ws) => (
              <div
                key={ws.weaponType}
                className="p-4 bg-er-surface-dark border border-er-border rounded-lg"
              >
                {editingWeapon === ws.weaponType ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-white">{ws.weaponType}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {(
                        [
                          { field: 'attackSpeedGrowth', label: '공속 성장 (%)' },
                          { field: 'basicAttackAmpGrowth', label: '기공 증폭 (%)' },
                          { field: 'skillAmpGrowth', label: '스킬 증폭 (%)' },
                        ] as const
                      ).map(({ field, label }) => (
                        <div key={field}>
                          <label className="block text-xs text-gray-400 mb-1">{label}</label>
                          <input
                            type="number"
                            value={weaponEditValues[field]}
                            onChange={(e) =>
                              setWeaponEditValues((prev) => ({
                                ...prev,
                                [field]: e.target.value,
                              }))
                            }
                            step="any"
                            className="w-full px-2 py-1.5 bg-er-surface border border-er-border rounded text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={cancelEditWeapon}
                        disabled={weaponSaving}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        취소
                      </button>
                      <button
                        onClick={() => handleWeaponSave(ws.weaponType)}
                        disabled={weaponSaving}
                        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-800 text-white rounded text-sm transition-colors"
                      >
                        {weaponSaving ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-white">{ws.weaponType}</span>
                      <div className="flex gap-4 mt-1 text-xs text-gray-400">
                        <span>공속 성장: {ws.attackSpeedGrowth ?? '-'}%</span>
                        <span>기공 증폭: {ws.basicAttackAmpGrowth ?? '-'}%</span>
                        <span>스킬 증폭: {ws.skillAmpGrowth ?? '-'}%</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditWeapon(ws)}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => setDeletingWeapon(ws.weaponType)}
                        className="px-3 py-1.5 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {deletingWeapon && (
        <DeleteConfirmDialog
          title="무기 스탯 삭제"
          message={`"${deletingWeapon}" 무기 스탯을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
          isDeleting={isDeleting}
          onConfirm={handleWeaponDelete}
          onCancel={() => setDeletingWeapon(null)}
        />
      )}
    </div>
  );
}
