import { Search, X } from "lucide-react-native";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { colors, fonts, HIT, radius } from "@/theme";

export function SearchField({
  value,
  onChangeText,
  onSubmit,
  onFocus,
  autoFocus,
  editable = true,
  placeholder = "Search for vegetables, e.g. tomato, carrot…",
}: {
  value: string;
  onChangeText?: (s: string) => void;
  onSubmit?: () => void;
  onFocus?: () => void;
  autoFocus?: boolean;
  editable?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Search size={19} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        onFocus={onFocus}
        autoFocus={autoFocus}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor="#8b9486"
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="Search vegetables"
        style={styles.input}
      />
      {value && onChangeText ? (
        <Pressable
          onPress={() => onChangeText("")}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          style={styles.clear}
        >
          <X size={16} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 50,
    paddingLeft: 16,
    paddingRight: 6,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.ink, minHeight: HIT, paddingVertical: 0 },
  clear: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
