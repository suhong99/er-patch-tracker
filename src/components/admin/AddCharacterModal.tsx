'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

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

type WeaponStatInput = {
  weaponType: string;
  attackSpeedGrowth: string;
  basicAttackAmpGrowth: string;
  skillAmpGrowth: string;
};

type AddCharacterModalProps = {
  onClose: () => void;
  onSuccess: () => void;
};

const emptyWeapon = (): WeaponStatInput => ({
  weaponType: '',
  attackSpeedGrowth: '',
  basicAttackAmpGrowth: '',
  skillAmpGrowth: '',
});

const parseNum = (v: string): number | null => {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

export function AddCharacterModal({
  onClose,
  onSuccess,
}: AddCharacterModalProps): React.JSX.Element {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [hpBase, setHpBase] = useState('');
  const [hpGrowth, setHpGrowth] = useState('');
  const [hpRegenBase, setHpRegenBase] = useState('');
  const [hpRegenGrowth, setHpRegenGrowth] = useState('');
  const [defenseBase, setDefenseBase] = useState('');
  const [defenseGrowth, setDefenseGrowth] = useState('');
  const [attackBase, setAttackBase] = useState('');
  const [attackGrowth, setAttackGrowth] = useState('');
  const [attackSpeedBase, setAttackSpeedBase] = useState('');
  const [moveSpeed, setMoveSpeed] = useState('');
  const [weapons, setWeapons] = useState<WeaponStatInput[]>([emptyWeapon()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateWeapon = (idx: number, field: keyof WeaponStatInput, value: string): void => {
    setWeapons((prev) => prev.map((w, i) => (i === idx ? { ...w, [field]: value } : w)));
  };

  const addWeapon = (): void => setWeapons((prev) => [...prev, emptyWeapon()]);

  const removeWeapon = (idx: number): void => {
    if (weapons.length === 1) return;
    setWeapons((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('실험체 이름을 입력하세요.');
      return;
    }
    const validWeapons = weapons.filter((w) => w.weaponType.trim());
    if (validWeapons.length === 0) {
      setError('무기 역할군을 최소 1개 입력하세요.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const token = await user?.getIdToken();
      const res = await fetch('/api/admin/characters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          nameEn: nameEn.trim() || undefined,
          baseStats: {
            hpBase: parseNum(hpBase),
            hpGrowth: parseNum(hpGrowth),
            hpRegenBase: parseNum(hpRegenBase),
            hpRegenGrowth: parseNum(hpRegenGrowth),
            defenseBase: parseNum(defenseBase),
            defenseGrowth: parseNum(defenseGrowth),
            attackBase: parseNum(attackBase),
            attackGrowth: parseNum(attackGrowth),
            attackSpeedBase: parseNum(attackSpeedBase),
            moveSpeed: parseNum(moveSpeed),
            weaponStats: validWeapons.map((w) => ({
              weaponType: w.weaponType,
              attackSpeedGrowth: parseNum(w.attackSpeedGrowth),
              basicAttackAmpGrowth: parseNum(w.basicAttackAmpGrowth),
              skillAmpGrowth: parseNum(w.skillAmpGrowth),
            })),
          },
        }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? '저장 실패');
        return;
      }

      onSuccess();
    } catch {
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-er-surface border border-er-border rounded-xl p-6 w-full max-w-2xl my-8">
        <h2 className="text-xl font-bold text-white mb-6">새 실험체 추가</h2>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm">
            {error}
          </div>
        )}

        {/* 기본 정보 */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">기본 정보</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">이름 (한글) *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 재키"
                className="w-full px-3 py-2 bg-er-surface-dark border border-er-border rounded-lg text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">이름 (영문)</label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="예: Jackie"
                className="w-full px-3 py-2 bg-er-surface-dark border border-er-border rounded-lg text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
        </section>

        {/* 기본 스탯 */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">기본 스탯 (Lv.1)</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '체력 기본', value: hpBase, setter: setHpBase, placeholder: '850' },
              { label: '체력 성장', value: hpGrowth, setter: setHpGrowth, placeholder: '40' },
              {
                label: '체력 재생 기본',
                value: hpRegenBase,
                setter: setHpRegenBase,
                placeholder: '2.5',
              },
              {
                label: '체력 재생 성장',
                value: hpRegenGrowth,
                setter: setHpRegenGrowth,
                placeholder: '0.1',
              },
              {
                label: '방어력 기본',
                value: defenseBase,
                setter: setDefenseBase,
                placeholder: '20',
              },
              {
                label: '방어력 성장',
                value: defenseGrowth,
                setter: setDefenseGrowth,
                placeholder: '3',
              },
              { label: '공격력 기본', value: attackBase, setter: setAttackBase, placeholder: '55' },
              {
                label: '공격력 성장',
                value: attackGrowth,
                setter: setAttackGrowth,
                placeholder: '3',
              },
              {
                label: '공격속도 기본',
                value: attackSpeedBase,
                setter: setAttackSpeedBase,
                placeholder: '1.00',
              },
              { label: '이동속도', value: moveSpeed, setter: setMoveSpeed, placeholder: '350' },
            ].map(({ label, value, setter, placeholder }) => (
              <div key={label}>
                <label className="block text-xs text-gray-400 mb-1">{label}</label>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={placeholder}
                  step="any"
                  className="w-full px-3 py-2 bg-er-surface-dark border border-er-border rounded-lg text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                />
              </div>
            ))}
          </div>
        </section>

        {/* 무기 스탯 */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-300">무기 역할군 *</h3>
            <button
              type="button"
              onClick={addWeapon}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              + 추가
            </button>
          </div>
          <div className="space-y-3">
            {weapons.map((weapon, idx) => (
              <div key={idx} className="p-3 bg-er-surface-dark border border-er-border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">무기 {idx + 1}</span>
                  {weapons.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeWeapon(idx)}
                      className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">무기 타입 *</label>
                    <select
                      value={weapon.weaponType}
                      onChange={(e) => updateWeapon(idx, 'weaponType', e.target.value)}
                      className="w-full px-3 py-2 bg-er-surface border border-er-border rounded-lg text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="">선택...</option>
                      {WEAPON_TYPES.map((wt) => (
                        <option key={wt} value={wt}>
                          {wt}
                        </option>
                      ))}
                    </select>
                  </div>
                  {[
                    {
                      label: '공속 성장 (%)',
                      field: 'attackSpeedGrowth' as const,
                      placeholder: '3',
                    },
                    {
                      label: '기공 증폭 성장 (%)',
                      field: 'basicAttackAmpGrowth' as const,
                      placeholder: '2',
                    },
                    {
                      label: '스킬 증폭 성장 (%)',
                      field: 'skillAmpGrowth' as const,
                      placeholder: '4.4',
                    },
                  ].map(({ label, field, placeholder }) => (
                    <div key={field}>
                      <label className="block text-xs text-gray-400 mb-1">{label}</label>
                      <input
                        type="number"
                        value={weapon[field]}
                        onChange={(e) => updateWeapon(idx, field, e.target.value)}
                        placeholder={placeholder}
                        step="any"
                        className="w-full px-3 py-2 bg-er-surface border border-er-border rounded-lg text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-800 text-white rounded-lg transition-colors"
          >
            {saving ? '저장 중...' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}
