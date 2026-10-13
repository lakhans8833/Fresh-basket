import { forwardRef } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, fonts, radius } from "@/theme";

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string | null;
  hintTone?: "muted" | "success" | "danger";
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, hintTone = "muted", style, ...rest },
  ref,
) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label} nativeID={`lbl-${label}`}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        placeholderTextColor="#98a093"
        accessibilityLabel={label}
        accessibilityLabelledBy={`lbl-${label}`}
        accessibilityHint={error ?? hint ?? undefined}
        style={[styles.input, !!error && styles.inputError, rest.multiline && { minHeight: 84, textAlignVertical: "top", paddingTop: 12 }, style]}
        {...rest}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={[styles.hint, hintTone === "success" && { color: colors.leaf600 }, hintTone === "danger" && { color: colors.danger }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft, marginBottom: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 12, marginTop: 5 },
  hint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 5 },
});
