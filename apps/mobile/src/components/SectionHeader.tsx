import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, type } from "@/theme";

export function SectionHeader({ title, eyebrow, actionLabel, onAction }: { title: string; eyebrow?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={type.eyebrow}>{eyebrow}</Text> : null}
        <Text style={type.h2} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={`${actionLabel}: ${title}`} style={styles.action} hitSlop={6}>
          <Text style={styles.actionText}>{actionLabel}</Text>
          <ChevronRight size={16} color={colors.leaf600} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", marginBottom: 12 },
  // keep the 44pt touch target but sit the label on the heading baseline

  action: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingLeft: 8, marginBottom: -10 },
  actionText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.leaf600 },
});
