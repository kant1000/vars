import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'VARS - Lagos stylists, your craft, your income';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#111111',
          color: '#FFFFFF',
          fontFamily: 'Inter, Arial, sans-serif',
          padding: 72,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 64,
            right: 72,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 30,
            fontWeight: 800,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              border: '3px solid #FFFFFF',
              borderRadius: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0A7AFF',
              fontSize: 28,
            }}
          >
            +
          </div>
          VARS
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            maxWidth: 780,
          }}
        >
          <div
            style={{
              color: '#0A7AFF',
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 0,
              textTransform: 'uppercase',
              marginBottom: 28,
            }}
          >
            Now onboarding Lagos stylists
          </div>
          <div
            style={{
              fontSize: 84,
              lineHeight: 0.98,
              fontWeight: 900,
              letterSpacing: 0,
              marginBottom: 32,
            }}
          >
            Your craft,
            <br />
            your income.
          </div>
          <div
            style={{
              color: '#F5F5F5',
              fontSize: 34,
              lineHeight: 1.28,
              maxWidth: 760,
            }}
          >
            Join the home service beauty platform for barbing, hair styling,
            and makeup jobs in Lagos.
          </div>
        </div>
      </div>
    ),
    size
  );
}
