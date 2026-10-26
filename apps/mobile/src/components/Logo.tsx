import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { BRAND_NAME } from "@shared/types";
import { imageUrl } from "@/lib/config";
import { useSettings } from "@/lib/settings";
import { colors, fonts } from "@/theme";
import { BasketMark } from "./BasketMark";

/** Basket mark + store name (as on the website), or the uploaded logo. */
export function Logo({ size = "md", inverse = false }: { size?: "sm" | "md" | "lg"; inverse?: boolean }) {
  const { settings } = useSettings();
  const name = settings?.storeName ?? BRAND_NAME;
  const logo = imageUrl(settings?.logoUrl);
  const scale = size === "lg" ? 1.5 : size === "sm" ? 0.85 : 1;

  if (logo) {
    return (
      <Image
        source={{ uri: logo }}
        style={{ width: 120 * scale, height: 40 * scale }}
        contentFit="contain"
        accessibilityLabel={name}
      />
    );
  }

  // Same lock-up as the website: "Rams" centred over "— Fresh Basket —" (last two words on line 2).
  const words = name.trim().split(/\s+/).filter(Boolean);
  const [line1, line2] = words.length >= 3 ? [words.slice(0, -2).join(" "), words.slice(-2).join(" ")] : words.length === 2 ? [words[0]!, words[1]!] : [name, null];
  const main = inverse ? colors.white : colors.forest800;

  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel={name}>
      <BasketMark size={44 * scale} />
      <View style={{ marginLeft: 8 * scale, alignItems: "center" }}>
        <Text style={[styles.word, { fontSize: 20 * scale, lineHeight: 22 * scale, color: main }]} numberOfLines={1}>
          {line1}
        </Text>
        {line2 ? (
          <Text style={[styles.word, { fontSize: 13.5 * scale, lineHeight: 16 * scale, color: main }]} numberOfLines={1}>
            — {line2} —
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  word: { fontFamily: fonts.serif },
});
