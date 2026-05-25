/**
 * ScissorIcon — web port of apps/mobile/components/ScissorsLoader.tsx
 *
 * Uses the exact same SVG paths and pivot point as the mobile component.
 * Animation is handled via SVG SMIL (animateTransform) for the active state,
 * and SVG transform attributes for the static completed/upcoming states.
 *
 * No 'use client' needed — pure SVG, no React state.
 */

const PIVOT_X = 277.095;
const PIVOT_Y = 436.009;
const CLOSE_DEG = 30; // spec: 30deg; mobile uses 32deg — close enough

const PATH_LEFT =
  'M554.191 716.322C516.792 718.707 502.426 717.06 498.184 697.168C352.084 707.119 402.384 607.622 380.27 573.355C369.601 524.789 326.15 499.036 263.831 486.394C162.294 311.966 69.9515 145.85 0 0L331.637 445.126C363.692 484.919 389.119 481.05 424.488 540.342C458.142 552.486 559.353 535.219 527.662 672.105C519.004 694.4 532.269 701.037 554.191 716.322ZM293.951 436.009C293.951 426.69 286.404 419.144 277.095 419.144C267.787 419.144 260.24 426.69 260.24 436.009C260.24 445.318 267.787 452.865 277.095 452.865C286.404 452.865 293.951 445.318 293.951 436.009ZM512.913 626.843C512.913 599.079 490.398 576.563 462.624 576.563C434.86 576.563 412.344 599.079 412.344 626.843C412.344 654.617 434.86 677.133 462.624 677.133C490.398 677.133 512.913 654.617 512.913 626.843Z';

const PATH_RIGHT =
  'M26.5287 672.105C-5.1621 535.219 96.0492 552.486 129.703 540.342C165.081 481.05 190.509 484.919 222.563 445.126L554.191 0C484.249 145.85 391.906 311.966 290.36 486.394C228.051 499.036 184.59 524.789 173.921 573.355C151.817 607.622 202.116 707.119 56.0071 697.168C51.774 717.06 37.3987 718.707 0 716.322C21.9221 701.037 35.1864 694.4 26.5287 672.105ZM277.095 452.865C286.404 452.865 293.951 445.318 293.951 436.009C293.951 426.69 286.404 419.144 277.095 419.144C267.787 419.144 260.24 426.69 260.24 436.009C260.24 445.318 267.787 452.865 277.095 452.865ZM91.567 677.133C119.341 677.133 141.847 654.617 141.847 626.843C141.847 599.079 119.341 576.563 91.567 576.563C63.7933 576.563 41.287 599.079 41.287 626.843C41.287 654.617 63.7933 677.133 91.567 677.133Z';

const FILL_MAP = {
  completed: '#FFFFFF',
  active:    '#0A7AFF',
  upcoming:  '#444444',
} as const;

interface Props {
  state: 'completed' | 'active' | 'upcoming';
}

export function ScissorIcon({ state }: Props) {
  const fill = FILL_MAP[state];

  // Completed: blades closed (rotated toward each other)
  // Active/Upcoming: no static transform — active uses animateTransform,
  //                  upcoming stays at natural open position (0°)
  const leftTransform =
    state === 'completed'
      ? `rotate(${CLOSE_DEG}, ${PIVOT_X}, ${PIVOT_Y})`
      : undefined;

  const rightTransform =
    state === 'completed'
      ? `rotate(${-CLOSE_DEG}, ${PIVOT_X}, ${PIVOT_Y})`
      : undefined;

  // animateTransform values: open(0°) → closed(±30°) → open(0°)
  const leftAnim  = `0,${PIVOT_X},${PIVOT_Y};${CLOSE_DEG},${PIVOT_X},${PIVOT_Y};0,${PIVOT_X},${PIVOT_Y}`;
  const rightAnim = `0,${PIVOT_X},${PIVOT_Y};${-CLOSE_DEG},${PIVOT_X},${PIVOT_Y};0,${PIVOT_X},${PIVOT_Y}`;

  return (
    <svg
      width="32"
      height="37"
      viewBox="-120 -90 800 920"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <g transform={leftTransform}>
        <path fillRule="evenodd" clipRule="evenodd" d={PATH_LEFT} fill={fill} />
        {state === 'active' && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values={leftAnim}
            dur="1.4s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0;0.5;1"
            keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
          />
        )}
      </g>
      <g transform={rightTransform}>
        <path fillRule="evenodd" clipRule="evenodd" d={PATH_RIGHT} fill={fill} />
        {state === 'active' && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values={rightAnim}
            dur="1.4s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0;0.5;1"
            keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
          />
        )}
      </g>
    </svg>
  );
}
