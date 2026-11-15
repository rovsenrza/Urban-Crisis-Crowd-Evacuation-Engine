import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { color, radius, shadows, size, space, type } from "../design/theme";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "danger" | "quiet" | "inverse";
export type ButtonSize = "md" | "lg";

const VARIANTS: Record<ButtonVariant, { bg: string; pressed: string; text: string; border: string }> = {
  primary: { bg: color.accent, pressed: color.accentPressed, text: color.onAccent, border: color.accent },
  danger: { bg: color.danger, pressed: color.dangerPressed, text: color.onDanger, border: color.danger },
  secondary: { bg: color.bg, pressed: color.surface, text: color.ink, border: color.lineStrong },
  quiet: { bg: "transparent", pressed: color.accentSoft, text: color.accent, border: "transparent" },
  inverse: { bg: color.bg, pressed: color.surface, text: color.ink, border: color.bg },
};

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. */
  icon?: IconName;
  /** Fill the width of the container. */
  block?: boolean;
  /** Shows a spinner and blocks further presses while an action runs. */
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: string;
  accessibilityLabel?: string;
}

export function Button({ variant = "secondary", size: buttonSize = "md", icon, block, busy, disabled, onPress, children, accessibilityLabel }: ButtonProps) {
  const look = VARIANTS[variant];
  const inactive = Boolean(disabled || busy);
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled: inactive, busy: Boolean(busy) }}
      style={({ pressed }) => [
        styles.button,
        buttonSize === "lg" && styles.large,
        block ? styles.block : styles.inline,
        { backgroundColor: pressed ? look.pressed : look.bg, borderColor: look.border },
        variant === "quiet" && styles.quiet,
        inactive && styles.inactive,
      ]}
    >
      {busy ? <ActivityIndicator color={look.text} /> : icon && <Icon name={icon} color={look.text} />}
      <Text style={[buttonSize === "lg" ? type.bodyLarge : type.bodyMedium, styles.label, { color: look.text }]}>{children}</Text>
    </Pressable>
  );
}

interface IconButtonProps {
  icon: IconName;
  /** Required: an icon alone says nothing to a screen reader. */
  label: string;
  /** `raised` sits on the map with its own ground and shadow. */
  variant?: "plain" | "raised";
  onPress: () => void;
  disabled?: boolean;
}

export function IconButton({ icon, label, variant = "plain", onPress, disabled }: IconButtonProps) {
  const raised: ViewStyle | false = variant === "raised" && styles.raised;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={space[1]}
      style={({ pressed }) => [styles.iconButton, raised, pressed && styles.iconPressed, disabled && styles.inactive]}
    >
      <View pointerEvents="none">
        <Icon name={icon} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    minHeight: size.control,
    paddingVertical: space[2],
    paddingHorizontal: space[5],
    borderWidth: size.border,
    borderRadius: radius.md,
  },
  large: { minHeight: size.controlLg },
  block: { alignSelf: "stretch" },
  inline: { alignSelf: "flex-start" },
  quiet: { paddingHorizontal: space[3] },
  inactive: { opacity: 0.5 },
  label: { flexShrink: 1, textAlign: "center" },
  iconButton: {
    width: size.tap,
    height: size.tap,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  iconPressed: { backgroundColor: color.surface },
  raised: { width: size.control, height: size.control, backgroundColor: color.bg, ...shadows.raised },
});
