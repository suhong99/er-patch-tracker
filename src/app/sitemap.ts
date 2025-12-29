import type { MetadataRoute } from 'next';
import { loadBalanceData, extractCharacters } from '@/lib/patch-data';

const SITE_URL = 'https://er-patch-tracker.vercel.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await loadBalanceData();
  const characters = extractCharacters(data);

  // 캐릭터 페이지들
  const characterPages = characters.map((character) => ({
    url: `${SITE_URL}/character/${encodeURIComponent(character.name)}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...characterPages,
  ];
}
