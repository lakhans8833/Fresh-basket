import { Image } from "expo-image";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { imageUrl } from "@/lib/config";
import { colors } from "@/theme";
import { LeafMark } from "./LeafMark";

/** Product/category image on a tinted background, with a leaf placeholder when there is no image. */
export function ProductImage({
  uri,
  alt,
  style,
  tint = colors.sage50,
  contentFit = "cover",
}: {
  uri: string | null | undefined;
  alt?: string;
  style?: StyleProp<ViewStyle>;
  tint?: string;
  contentFit?: "cover" | "contain";
}) {
  const src = imageUrl(uri);
  return (
    <View style={[styles.wrap, { backgroundColor: tint }, style]}>
      {src ? (
        <Image
          source={{ uri: src }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          transition={200}
          accessibilityLabel={alt}
          accessible={!!alt}
        />
      ) : (
        <View style={styles.placeholder} accessibilityLabel={alt ? `${alt} (no photo yet)` : undefined}>
          <LeafMark size={36} color={colors.lime300} vein={colors.sage50} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  placeholder: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
});
