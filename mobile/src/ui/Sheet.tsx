import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, layer, radius, shadows, space, type } from "../design/theme";
import { IconButton } from "./Button";

interface DockedProps {
  /** Accessible name of the region. */
  label: string;
  children: ReactNode;
}

/** A sheet that stays over the lower edge of the map and never blocks it. */
export function DockedSheet({ label, children }: DockedProps) {
  return (
    <View style={styles.docked} accessibilityLabel={label}>
      <ScrollView contentContainerStyle={styles.dockedBody} bounces={false} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Label of the close button. */
  closeLabel: string;
  children: ReactNode;
}

/** A modal bottom sheet. A press on the scrim, the close button or the system back gesture closes it. */
export function ModalSheet({ open, onClose, title, closeLabel, children }: ModalProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
        <View style={[styles.modal, { paddingBottom: space[4] + insets.bottom }]} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={[type.heading, styles.title]} accessibilityRole="header">{title}</Text>
            <IconButton icon="close" label={closeLabel} onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  docked: {
    position: "absolute",
    zIndex: layer.sheet,
    left: space[2],
    right: space[2],
    bottom: space[2],
    maxHeight: "60%",
    borderRadius: radius.lg,
    backgroundColor: color.bg,
    ...shadows.raised,
  },
  dockedBody: { padding: space[4] },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: color.scrim },
  modal: {
    maxHeight: "85%",
    paddingTop: space[4],
    paddingHorizontal: space[4],
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: color.bg,
    ...shadows.overlay,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3] },
  title: { flex: 1 },
  modalBody: { gap: space[3], paddingTop: space[3] },
});
