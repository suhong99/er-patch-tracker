'use client';

import { useState } from 'react';
import Image from 'next/image';

type Props = {
  name: string;
  imageUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeMap = {
  sm: { container: 'h-12 w-12', text: 'text-lg', pixels: 48 },
  md: { container: 'h-20 w-20', text: 'text-2xl', pixels: 80 },
  lg: { container: 'h-28 w-28', text: 'text-4xl', pixels: 112 },
};

export default function CharacterImage({
  name,
  imageUrl,
  size = 'md',
  className = '',
}: Props): React.ReactElement {
  const [imageError, setImageError] = useState(false);
  const initial = name.charAt(0);
  const { container, text, pixels } = sizeMap[size];

  const showImage = imageUrl && !imageError;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl border border-[#2a2d35] bg-[#1a1d24] ${container} ${className}`}
    >
      {showImage ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes={`${pixels}px`}
          className="object-cover"
          onError={() => setImageError(true)}
          priority={size === 'lg'}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-violet-500/20 to-cyan-500/20">
          <span className={`font-bold text-zinc-400 ${text}`}>{initial}</span>
        </div>
      )}
    </div>
  );
}
