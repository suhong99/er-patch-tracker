'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: '패치 내역' },
  { href: '/bugs', label: '버그 랭킹' },
  { href: '/stats', label: '스텟 비교' },
] as const;

export default function NavLinks(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {NAV_ITEMS.map(({ href, label }) => {
        const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-violet-500/15 text-violet-300'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
