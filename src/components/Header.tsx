import Link from 'next/link';
import NavLinks from './NavLinks';

export default function Header(): React.JSX.Element {
  return (
    <header className="sticky top-0 z-50 border-b border-[#2a2d35] bg-[#0a0b0f]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="bg-linear-to-r from-violet-400 to-cyan-400 bg-clip-text text-sm font-black tracking-tight text-transparent"
        >
          ER PATCH TRACKER
        </Link>
        <NavLinks />
      </div>
    </header>
  );
}
