import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = '이터널 리턴 패치 트래커';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OGImage(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        background: 'linear-gradient(135deg, #0a0b0f 0%, #1a1b2e 50%, #0a0b0f 100%)',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* 배경 그라데이션 효과 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(ellipse at top, rgba(139, 92, 246, 0.15), transparent 50%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            'radial-gradient(ellipse at bottom right, rgba(34, 211, 238, 0.1), transparent 50%)',
        }}
      />

      {/* 메인 콘텐츠 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}
      >
        {/* 뱃지 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(139, 92, 246, 0.1)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '9999px',
            padding: '8px 20px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#8b5cf6',
            }}
          />
          <span style={{ color: '#c4b5fd', fontSize: '20px' }}>패치 데이터 추적</span>
        </div>

        {/* 타이틀 */}
        <h1
          style={{
            fontSize: '72px',
            fontWeight: 900,
            background: 'linear-gradient(to right, #ffffff, #c4b5fd, #67e8f9)',
            backgroundClip: 'text',
            color: 'transparent',
            margin: 0,
            letterSpacing: '-2px',
          }}
        >
          ETERNAL RETURN
        </h1>

        {/* 서브타이틀 */}
        <p
          style={{
            fontSize: '32px',
            color: '#a1a1aa',
            margin: '16px 0 0 0',
          }}
        >
          실험체별 밸런스 패치 히스토리
        </p>

        {/* 하단 태그들 */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '40px',
          }}
        >
          {['상향', '하향', '조정'].map((tag, i) => (
            <div
              key={tag}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '18px',
                fontWeight: 600,
                background:
                  i === 0
                    ? 'rgba(16, 185, 129, 0.1)'
                    : i === 1
                      ? 'rgba(244, 63, 94, 0.1)'
                      : 'rgba(251, 191, 36, 0.1)',
                color: i === 0 ? '#34d399' : i === 1 ? '#fb7185' : '#fbbf24',
                border: `1px solid ${i === 0 ? 'rgba(16, 185, 129, 0.3)' : i === 1 ? 'rgba(244, 63, 94, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`,
              }}
            >
              {tag}
            </div>
          ))}
        </div>
      </div>

      {/* 하단 URL */}
      <div
        style={{
          position: 'absolute',
          bottom: '32px',
          color: '#52525b',
          fontSize: '18px',
        }}
      >
        er-patch-tracker.vercel.app
      </div>
    </div>,
    {
      ...size,
    }
  );
}
