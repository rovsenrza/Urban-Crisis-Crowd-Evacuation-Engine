import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { color, density, muted, radius, shadows, size, space, type } from "../design/theme";
import { Icon, type IconName } from "./Icon";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  icon?: IconName;
  /** Colour of the "on" state. `priority` is reserved for the special-care role. */
  tone?: "accent" | "priority";
  disabled?: boolean;
}

const SWITCH_TONES = {
  accent: { on: color.accent, soft: color.accentSoft },
  priority: { on: color.priority, soft: color.prioritySoft },
} as const;

/** An on/off setting. The whole row is the control. */
export function Switch({ checked, onChange, label, description, icon, tone = "accent", disabled }: SwitchProps) {
  const look = SWITCH_TONES[tone];
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.switch,
        checked && { borderColor: look.on, backgroundColor: look.soft },
        pressed && !checked && styles.pressed,
        disabled && styles.inactive,
      ]}
    >
      {icon && <Icon name={icon} size="lg" color={look.on} />}
      <View style={styles.switchText}>
        <Text style={type.bodyMedium}>{label}</Text>
        {description ? <Text style={[type.small, muted]}>{description}</Text> : null}
      </View>
      <View style={[styles.track, checked && { backgroundColor: look.on, justifyContent: "flex-end" }]}>
        <View style={styles.knob} />
      </View>
    </Pressable>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; /** Longer name for screen readers. */ name?: string }[];
  onChange: (value: T) => void;
}

/** A small set of mutually exclusive choices. */
export function SegmentedControl<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.name ?? option.label}
            accessibilityState={{ checked: selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[type.bodyMedium, !selected && muted]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Message under the field. */
  error?: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  autoFocus?: boolean;
  returnKeyType?: TextInputProps["returnKeyType"];
  onSubmitEditing?: () => void;
  maxLength?: number;
}

/** A visible label above a text input, with the error under it. */
export function TextField({ label, error, ...input }: TextFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={type.smallMedium}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        autoCorrect={false}
        placeholderTextColor={color.inkMuted}
        style={[type.body, styles.input, error ? styles.inputInvalid : null]}
      />
      {error ? <Text style={[type.small, styles.fieldError]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  switch: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: density.comfortable.rowHeight,
    paddingVertical: space[3],
    paddingHorizontal: density.comfortable.rowPadding,
    borderWidth: size.border,
    borderColor: color.lineStrong,
    borderRadius: radius.md,
    backgroundColor: color.bg,
  },
  pressed: { backgroundColor: color.surface },
  inactive: { opacity: 0.5 },
  switchText: { flex: 1, gap: space[1] },
  track: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    width: size.switchWidth,
    height: size.switchHeight,
    padding: space[1],
    borderRadius: radius.full,
    backgroundColor: color.lineStrong,
  },
  knob: { width: size.switchKnob, height: size.switchKnob, borderRadius: radius.full, backgroundColor: color.bg },
  segmented: {
    flexDirection: "row",
    gap: space[1],
    padding: space[1],
    borderRadius: radius.md,
    backgroundColor: color.surfaceSunken,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: size.tap,
    paddingVertical: space[1],
    paddingHorizontal: space[3],
    borderRadius: radius.sm,
  },
  segmentSelected: { backgroundColor: color.bg, ...shadows.raised },
  field: { gap: space[1] },
  input: {
    minHeight: size.control,
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderWidth: size.border,
    borderColor: color.lineStrong,
    borderRadius: radius.sm,
    backgroundColor: color.bg,
    // A fixed line height clips the caret on iOS; let the input size its own line.
    lineHeight: undefined,
  },
  inputInvalid: { borderColor: color.danger },
  fieldError: { color: color.dangerText },
});
