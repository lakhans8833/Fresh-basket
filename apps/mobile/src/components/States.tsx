import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RefreshCw, WifiOff } from "lucide-react-native";
import { colors, fonts, type } from "@/theme";
import { Button } from "./Button";
import { LeafMark } from "./LeafMark";

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View style={styles.iconCircle}>{icon ?? <LeafMark size={34} />}</View>
      <Text style={[type.h2, styles.center]}>{title}</Text>
      {message ? <Text style={[type.body, styles.center, styles.msg]}>{message}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={{ marginTop: 18 }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry, compact }: { message: string; onRetry?: () => void; compact?: boolean }) {
  const offline = /offline|connection|reach/i.test(message);
  return (
    <View style={[styles.wrap, compact && { paddingVertical: 20 }]} accessibilityRole="alert">
      <View style={[styles.iconCircle, { backgroundColor: colors.dangerBg }]}>
        <WifiOff size={26} color={colors.danger} />
      </View>
      <Text style={[type.h3, styles.center]}>{offline ? "Can't connect" : "Something went wrong"}</Text>
      <Text style={[type.body, styles.center, styles.msg]}>{message}</Text>
      {onRetry ? (
        <Button
          label="Retry"
          variant="outline"
          size="sm"
          onPress={onRetry}
          icon={<RefreshCw size={16} color={colors.forest900} />}
          style={{ marginTop: 14 }}
        />
      ) : null}
    </View>
  );
}

export function InlineMessage({ tone = "info", children }: { tone?: "info" | "warning" | "danger" | "success"; children: ReactNode }) {
  const map = {
    info: { bg: colors.sage100, fg: colors.inkSoft },
    warning: { bg: colors.amberBg, fg: colors.amber },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    success: { bg: colors.lime100, fg: colors.leaf600 },
  }[tone];
  return (
    <View
      style={[styles.inline, { backgroundColor: map.bg }]}
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.inlineText, { color: map.fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingVertical: 48 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.lime100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  center: { textAlign: "center" },
  msg: { marginTop: 6, maxWidth: 320 },
  inline: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  inlineText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
});
