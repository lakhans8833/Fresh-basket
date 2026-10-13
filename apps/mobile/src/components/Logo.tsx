import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { imageUrl } from "@/lib/config";
import { useSettings } from "@/lib/settings";
import { colors, fonts } from "@/theme";
import { LeafMark } from "./LeafMark";

/** Leaf mark + stacked lowercase store name ("fresh / basket."), or the uploaded logo. */
export function Logo({ size = "md", inverse = false }: { size?: "sm" | "md" | "lg"; inverse?: boolean }) {
  const { settings } = useSettings();
  const name = settings?.storeName ?? "Fresh Basket";
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

  const words = name.toLowerCase().split(/\s+/).filter(Boolean);
  const first = words.slice(0, Math.ceil(words.length / 2)).join(" ");
  const second = words.slice(Math.ceil(words.length / 2)).join(" ");
  const textColor = inverse ? colors.ivory : colors.forest900;

  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel={name}>
      <LeafMark size={30 * scale} color={inverse ? colors.lime300 : colors.leaf500} vein={inverse ? colors.forest900 : colors.ivory} />
      <View style={{ marginLeft: 6 * scale }}>
        <Text style={[styles.word, { fontSize: 17 * scale, lineHeight: 16 * scale, color: textColor }]}>{first}</Text>
        {second ? (
          <Text style={[styles.word, { fontSize: 17 * scale, lineHeight: 18 * scale, color: textColor }]}>
            {second}
            <Text style={{ color: inverse ? colors.lime300 : colors.leaf500 }}>.</Text>
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  word: { fontFamily: fonts.serif, letterSpacing: -0.4 },
});
