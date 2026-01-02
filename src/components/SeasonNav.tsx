'use client';

import { useState, useEffect } from 'react';
import type { Season } from '@/lib/seasons';

type Props = {
  seasons: Season[];
};

export default function SeasonNav({ seasons }: Props): React.ReactElement | null {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleScroll = (): void => {
      setShowScrollTop(window.scrollY > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = (): void => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSeason = (seasonNumber: number): void => {
    const element = document.getElementById(`season-${seasonNumber}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setIsOpen(false);
  };

  if (seasons.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6 sm:gap-3">
      {/* 시즌 선택 드롭다운 */}
      {isOpen && (
        <div className="mb-1 max-h-[60vh] overflow-y-auto flex flex-col gap-1 rounded-xl border border-[#2a2d35] bg-[#13151a]/95 p-1.5 shadow-xl backdrop-blur-sm sm:mb-2 sm:p-2">
          {seasons.map((season) => (
            <button
              key={season.number}
              onClick={() => scrollToSeason(season.number)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-300 transition-colors hover:bg-violet-500/20 hover:text-violet-300 active:bg-violet-500/30 sm:px-4"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/20 text-xs font-bold text-violet-400">
                {season.number}
              </span>
              <span>{season.nameKo}</span>
            </button>
          ))}
        </div>
      )}

      {/* 버튼 그룹 */}
      <div className="flex gap-2">
        {/* 시즌 이동 버튼 */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-all sm:h-12 sm:w-12 ${
            isOpen
              ? 'border-violet-500 bg-violet-500 text-white'
              : 'border-[#2a2d35] bg-[#13151a]/95 text-zinc-400 hover:border-violet-500/50 hover:text-violet-400 active:bg-violet-500/20'
          } backdrop-blur-sm`}
          aria-label="시즌 이동"
          title="시즌 이동"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 10h16M4 14h16M4 18h16"
            />
          </svg>
        </button>

        {/* 상단 이동 버튼 */}
        {showScrollTop && (
          <button
            onClick={scrollToTop}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[#2a2d35] bg-[#13151a]/95 text-zinc-400 shadow-lg backdrop-blur-sm transition-all hover:border-violet-500/50 hover:text-violet-400 active:bg-violet-500/20 sm:h-12 sm:w-12"
            aria-label="상단으로 이동"
            title="상단으로 이동"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
