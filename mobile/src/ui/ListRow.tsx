import { Children, Fragment, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, density, muted, size, space, tones, type } from "../design/theme";
import { Icon, type IconName } from "./Icon";

interface Props {
  title: ReactNode | string;
  subtitle?: string;
  /** Leading icon. */
  icon?: IconName;
  /** Tone of the leading icon. */
  tone?: "neutral" | "accent" | "danger" | "ok" | "warn" | "priority";
  /** Content under the title block (a meter, badges). */
  children?: ReactNode;
  /** Trailing content (badge, value, control). */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Shows a chevron: the row opens another screen. */
  chevron?: boolean;
  selected?: boolean;
}

/** One row of a list: static, or a button when `onPress` is given. */
export function ListRow({ title, subtitle, icon, tone = "neutral", children, trailing, onPress, chevron, selected }: Props) {
  const body = (
    <>
      {icon && <Icon name={icon} color={tones[tone].icon} />}
      <View style={styles.main}>
        {typeof title === "string" ? <Text style={type.bodyMedium}>{title}</Text> : title}
        {subtitle ? <Text style={[type.small, muted]}>{subtitle}</Text> : null}
        {children}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {chevron && <Icon name="chevronRight" size="sm" color={color.inkMuted} />}
    </>
  );
  if (!onPress) return <View style={[styles.row, selected && styles.selected]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      style={({ pressed }) => [styles.row, selected && styles.selected, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/** A plain list with hairlines between rows. */
export function List({ children, label }: { children: ReactNode; label?: string }) {
  const rows = Children.toArray(children);
  return (
    <View accessibilityLabel={label}>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 && <View style={styles.hairline} />}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: density.comfortable.rowHeight,
    paddingVertical: space[3],
    paddingHorizontal: density.comfortable.rowPadding,
  },
  selected: { backgroundColor: color.accentSoft },
  pressed: { backgroundColor: color.surface },
  main: { flex: 1, gap: space[1] },
  trailing: { flexDirection: "row", alignItems: "center", gap: space[2] },
  hairline: { height: size.border, backgroundColor: color.line },
});
