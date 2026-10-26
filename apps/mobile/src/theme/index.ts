import { Platform, type TextStyle, type ViewStyle } from "react-native";

/** Same brand colours as the website (apps/web/src/app/globals.css). */
export const colors = {
  forest900: "#0a4a1c",
  forest800: "#0b6623",
  leaf600: "#15803d",
  leaf500: "#22b455",
  lime300: "#a7d769",
  lime200: "#c8e79e",
  lime100: "#e5f3d2",
  lime50: "#f2f9e9",
  ivory: "#fcfbf7",
  sage50: "#f4f8f1",
  sage100: "#e9f1e4",
  sage200: "#d6e5ce",
  ink: "#13231a",
  inkSoft: "#3a4b40",
  muted: "#5f6d62",
  line: "#e2e9dd",
  tomato: "#e4452e",
  /** Discount tags: white text on this passes WCAG AA. */
  offer: "#c2410c",
  danger: "#b42318",
  dangerBg: "#fdf0ee",
  amber: "#9a5b00",
  amberBg: "#fdf5e1",
  white: "#ffffff",
} as const;

/** Font family names registered in app/_layout.tsx via expo-font. */
export const fonts = {
  /** Headings (Poppins, as on the website). */
  display: "Poppins_700Bold",
  displaySemibold: "Poppins_600SemiBold",
  /** Brand name in the logo (Fraunces, as on the website). */
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
  display: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.ink, letterSpacing: -0.3 },
  h1: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.ink, letterSpacing: -0.2 },
  h2: { fontFamily: fonts.display, fontSize: 19, lineHeight: 25, color: colors.ink },
  h3: { fontFamily: fonts.displaySemibold, fontSize: 16, lineHeight: 22, color: colors.ink },
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
