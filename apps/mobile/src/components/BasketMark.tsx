import Svg, { Circle, Path } from "react-native-svg";

/** Round brand mark: a woven basket of vegetables in a green ring (same artwork as the website logo). */
export function BasketMark({ size = 44, ring = true }: { size?: number; ring?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      {ring ? <Circle cx={60} cy={60} r={56} fill="#fff" stroke="#0b6623" strokeWidth={6} /> : null}
      <Path d="M14 78c8-14 22-16 28-10-6 9-18 14-28 10Z" fill="#16a34a" />
      <Path d="M106 78c-8-14-22-16-28-10 6 9 18 14 28 10Z" fill="#16a34a" />
      <Circle cx={40} cy={48} r={11} fill="#2f9e44" />
      <Circle cx={52} cy={40} r={11} fill="#37b24d" />
      <Circle cx={80} cy={44} r={11} fill="#2f9e44" />
      <Path d="M70 26 86 52l-6 3Z" fill="#f08c00" />
      <Path d="M70 26c-2-6 2-10 2-10M70 26c-6-3-8 0-8 0M70 26c4-5 9-4 9-4" stroke="#2b8a3e" strokeWidth={2.6} strokeLinecap="round" fill="none" />
      <Path d="M62 44c6-2 13 2 13 9s-4 10-9 10-10-4-9-10c0-5 2-8 5-9Z" fill="#fab005" />
      <Path d="M66 43c0-3 2-5 4-5" stroke="#2b8a3e" strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <Circle cx={44} cy={58} r={10} fill="#e03131" />
      <Circle cx={84} cy={60} r={8} fill="#e03131" />
      <Path d="M40 49.5h8M44 48v4" stroke="#2b8a3e" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M26 62h68l-8 30H34Z" fill="#c07a2c" />
      <Path d="M24 60h72a3 3 0 0 1 0 6H24a3 3 0 0 1 0-6Z" fill="#9a5b1c" />
      <Path d="M31 74h58M33 82h54M44 66l3 26M60 66v26M76 66l-3 26" stroke="#8a4f17" strokeWidth={2} opacity={0.75} />
    </Svg>
  );
}
