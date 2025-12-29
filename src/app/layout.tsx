import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from '@/components/Providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const SITE_NAME = '이터널 리턴 패치 트래커';
const SITE_DESCRIPTION =
  '이터널 리턴 실험체별 밸런스 패치 히스토리를 한눈에 확인하세요. 상향, 하향, 조정 내역과 연속 패치 기록을 추적합니다.';
const SITE_URL = 'https://er-patch-tracker.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    '이터널 리턴',
    'Eternal Return',
    '패치노트',
    '밸런스 패치',
    '실험체',
    '상향',
    '하향',
    '너프',
    '버프',
  ],
  authors: [{ name: 'ER Patch Tracker' }],
  creator: 'ER Patch Tracker',
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'vaR8GNOeHhQY5Ce8595RJurGmROZAZDp_KWXv7e5wmI',
    other: {
      'naver-site-verification': '151c74c6866aa998716332e723d5ea47a339ac91',
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
