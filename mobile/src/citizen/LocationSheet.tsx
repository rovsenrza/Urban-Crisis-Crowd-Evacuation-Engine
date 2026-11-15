import { StyleSheet, Text } from "react-native";
import { type } from "../design/theme";
import { t } from "../i18n";
import { Banner, Button, List, ListRow, ModalSheet } from "../ui";
import { useCitizen } from "./session";
import { useLocate } from "./useLocate";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Set the position: device location or a district. Tapping the map is the third way. */
export function LocationSheet({ open, onClose }: Props) {
  const { meta, zoneId, chooseZone, planning } = useCitizen();
  const { locate, locating, errorText } = useLocate(onClose);

  return (
    <ModalSheet open={open} onClose={onClose} title={t("citizen.whereAreYou")} closeLabel={t("app.close")}>
      <Button variant="primary" size="lg" icon="locate" block busy={locating} onPress={() => void locate()}>
        {t(locating ? "citizen.locating" : "citizen.shareLocation")}
      </Button>
      {errorText && <Banner tone="danger">{errorText}</Banner>}
      <Text style={styles.heading} accessibilityRole="header">{t("citizen.orDistrict")}</Text>
      <List label={t("citizen.chooseDistrict")}>
        {(meta?.zones ?? []).map((zone) => (
          <ListRow
            key={zone.id}
            title={zone.name}
            icon="pin"
            selected={zone.id === zoneId}
            onPress={() => {
              if (planning) return;
              void chooseZone(zone.id).then((ok) => ok && onClose());
            }}
          />
        ))}
      </List>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  heading: type.subheading,
});
