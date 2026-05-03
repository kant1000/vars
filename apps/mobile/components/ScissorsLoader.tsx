import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

const AnimatedG = Animated.createAnimatedComponent(G);

const W = 28;
const H = 36;
const VB_W = 555;
const VB_H = 718;
const PIVOT_X = 277.095;
const PIVOT_Y = 436.009;
// Tips are ~65° apart at rest; rotate each blade ~33° to bring them together
const CLOSE_DEG = 33;

const FILLS = {
  light: '#FFFFFF',
  dark: '#1A1A1A',
};

const PATH_LEFT =
  'M554.191 716.322C516.792 718.707 502.426 717.06 498.184 697.168C352.084 707.119 402.384 607.622 380.27 573.355C369.601 524.789 326.15 499.036 263.831 486.394C162.294 311.966 69.9515 145.85 0 0L331.637 445.126C363.692 484.919 389.119 481.05 424.488 540.342C458.142 552.486 559.353 535.219 527.662 672.105C519.004 694.4 532.269 701.037 554.191 716.322ZM293.951 436.009C293.951 426.69 286.404 419.144 277.095 419.144C267.787 419.144 260.24 426.69 260.24 436.009C260.24 445.318 267.787 452.865 277.095 452.865C286.404 452.865 293.951 445.318 293.951 436.009ZM512.913 626.843C512.913 599.079 490.398 576.563 462.624 576.563C434.86 576.563 412.344 599.079 412.344 626.843C412.344 654.617 434.86 677.133 462.624 677.133C490.398 677.133 512.913 654.617 512.913 626.843Z';

const PATH_RIGHT =
  'M26.5287 672.105C-5.1621 535.219 96.0492 552.486 129.703 540.342C165.081 481.05 190.509 484.919 222.563 445.126L554.191 0C484.249 145.85 391.906 311.966 290.36 486.394C228.051 499.036 184.59 524.789 173.921 573.355C151.817 607.622 202.116 707.119 56.0071 697.168C51.774 717.06 37.3987 718.707 0 716.322C21.9221 701.037 35.1864 694.4 26.5287 672.105ZM277.095 452.865C286.404 452.865 293.951 445.318 293.951 436.009C293.951 426.69 286.404 419.144 277.095 419.144C267.787 419.144 260.24 426.69 260.24 436.009C260.24 445.318 267.787 452.865 277.095 452.865ZM91.567 677.133C119.341 677.133 141.847 654.617 141.847 626.843C141.847 599.079 119.341 576.563 91.567 576.563C63.7933 576.563 41.287 599.079 41.287 626.843C41.287 654.617 63.7933 677.133 91.567 677.133Z';

type Color = 'light' | 'dark';

interface Props {
  size?: 'small' | 'large';
  color?: Color;
}

export function ScissorsLoader({ color = 'dark' }: Props) {
  const angle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(angle, {
          toValue: CLOSE_DEG,
          duration: 350,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(angle, {
          toValue: 0,
          duration: 350,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const negAngle = angle.interpolate({
    inputRange: [0, CLOSE_DEG],
    outputRange: [0, -CLOSE_DEG],
  });

  const fill = FILLS[color];

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${VB_W} ${VB_H}`} fill="none">
      <AnimatedG rotation={angle} originX={PIVOT_X} originY={PIVOT_Y}>
        <Path fillRule="evenodd" clipRule="evenodd" d={PATH_LEFT} fill={fill} />
      </AnimatedG>
      <AnimatedG rotation={negAngle} originX={PIVOT_X} originY={PIVOT_Y}>
        <Path fillRule="evenodd" clipRule="evenodd" d={PATH_RIGHT} fill={fill} />
      </AnimatedG>
    </Svg>
  );
}
