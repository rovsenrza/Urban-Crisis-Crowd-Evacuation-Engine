/** Launch screen and the product mark. */
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { color, size, space } from "../design/theme";

/** The product mark: four arrows meeting at one point, the sign for an assembly point. */
export function Mark({ size: markSize = "md" }: { size?: "md" | "lg" }) {
  const side = markSize === "lg" ? space[8] : size.iconXl;
  return (
    <Svg width={side} height={side} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect width={48} height={48} rx={12} fill={color.ink} />
      <G fill={color.bg}>
        <Path d="M10 10l9 2.5-6.5 6.5L10 10z" />
        <Path d="M38 10l-2.5 9-6.5-6.5L38 10z" />
        <Path d="M10 38l2.5-9 6.5 6.5L10 38z" />
        <Path d="M38 38l-9-2.5 6.5-6.5L38 38z" />
        <Circle cx={24} cy={24} r={4} />
      </G>
    </Svg>
  );
}

/** Shown while storage, fonts and the session start. */
export function Launch({ label }: { label: string }) {
  return (
    <View style={styles.launch} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      <Mark size="lg" />
      <ActivityIndicator color={color.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  launch: { flex: 1, alignItems: "center", justifyContent: "center", gap: space[5], backgroundColor: color.bg },
});
