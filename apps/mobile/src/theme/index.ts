import { Platform, type TextStyle, type ViewStyle } from "react-native";

export const colors = {
  forest900: "#14301f",
  forest800: "#1b3d28",
  leaf600: "#3d7f34",
  leaf500: "#4f9440",
  lime300: "#bfe08f",
  lime200: "#d3eab2",
  lime100: "#e7f4d6",
  ivory: "#fbf9f3",
  sage50: "#f4f6ef",
  sage100: "#ebefe3",
  ink: "#17271b",
  inkSoft: "#3c4a3f",
  muted: "#66715f",
  line: "#e3e6da",
  tomato: "#e4572e",
  danger: "#b42318",
  dangerBg: "#fdf0ee",
  amber: "#9a6b00",
  amberBg: "#fdf5e1",
  white: "#ffffff",
} as const;

/** Font family names registered in app/_layout.tsx via expo-font. */
export const fonts = {
  serif: "Fraunces_600SemiBold",
  serifMedium: "Fraunces_500Medium",
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
/** Minimum touch target (iOS HIG 44pt / Material 48dp). */
export const HIT = 44;

export const type = {
  display: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 34, color: colors.forest900, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 32, color: colors.forest900, letterSpacing: -0.3 },
  h2: { fontFamily: fonts.serif, fontSize: 21, lineHeight: 26, color: colors.forest900 },
  h3: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 22, color: colors.forest900 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  smallStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.ink },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, textTransform: "uppercase", color: colors.leaf600 },
  price: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 20, color: colors.ink },
} satisfies Record<string, TextStyle>;

export const shadow: ViewStyle = Platform.select<ViewStyle>({
  ios: { shadowColor: "#14301f", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 2 },
  default: { boxShadow: "0 4px 14px rgba(20,48,31,0.08)" } as ViewStyle,
})!;
