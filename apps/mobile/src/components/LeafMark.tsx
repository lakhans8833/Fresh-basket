import Svg, { Path } from "react-native-svg";
import { colors } from "@/theme";

/** The brand leaf mark (also used as image placeholder). */
export function LeafMark({ size = 28, color = colors.leaf500, vein = colors.ivory }: { size?: number; color?: string; vein?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <Path d="M27 4C14 4 5 10 5 21c0 2.2.5 4.2 1.3 6C8 20 13 14.5 21 11 14.5 15 10.5 20.5 8.6 27.6 10.4 28.5 12.4 29 14.6 29 23.5 29 28 21 27 4Z" fill={color} />
      <Path d="M8.6 27.6C10.5 20.5 14.5 15 21 11" stroke={vein} strokeWidth={1.4} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
