import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, type } from "@/theme";
import { IconButton } from "./IconButton";

/** Top bar for stack screens: back button, serif title, optional right content. Handles the top inset. */
export function ScreenHeader({
  title,
  right,
  back = true,
  onBack,
  large,
}: {
  title: string;
  right?: ReactNode;
  back?: boolean;
  onBack?: () => void;
  large?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        {back ? (
          <IconButton label="Go back" onPress={goBack} variant="soft">
            <ArrowLeft size={21} color={colors.forest900} />
          </IconButton>
        ) : null}
        {!large ? (
          <Text style={[type.h2, styles.title, !back && { marginLeft: 4 }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={styles.right}>{right}</View>
      </View>
      {large ? (
        <Text style={[type.h1, { marginTop: 8, marginLeft: 4 }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.ivory, paddingHorizontal: 16, paddingBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  title: { flex: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" },
});
