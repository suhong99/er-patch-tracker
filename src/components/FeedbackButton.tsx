'use client';

type Props = {
  characterName?: string;
  className?: string;
};

export default function FeedbackButton({
  characterName,
  className = '',
}: Props): React.ReactElement {
  const handleClick = (): void => {
    const params = new URLSearchParams();
    if (characterName) {
      params.set('type', 'character');
      params.set('character', characterName);
    }
    const url = `/feedback${params.toString() ? `?${params.toString()}` : ''}`;
    window.open(url, '_blank', 'width=700,height=800,scrollbars=yes');
  };

  return (
    <button
      onClick={handleClick}
      className={`group inline-flex items-center gap-2 rounded-lg border border-[#2a2d35] bg-[#13151a] px-3 py-2 text-sm text-zinc-400 transition-colors hover:border-violet-500/50 hover:text-violet-400 ${className}`}
      title="피드백 보내기"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
        />
      </svg>
      <span className="hidden sm:inline">피드백</span>
    </button>
  );
}
