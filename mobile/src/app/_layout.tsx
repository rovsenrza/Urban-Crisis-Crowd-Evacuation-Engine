import { AlbertSans_400Regular, AlbertSans_500Medium, AlbertSans_700Bold, useFonts } from "@expo-google-fonts/albert-sans";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CitizenSessionProvider } from "../citizen/session";
import { color } from "../design/theme";
import { reloadLocale } from "../i18n";
import { hydrateStorage, STORAGE_KEYS } from "../platform";
import { Launch } from "../shell/Launch";

/**
 * Root: load fonts and stored preferences, then mount the citizen session
 * above every screen so state survives navigation.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ AlbertSans_400Regular, AlbertSans_500Medium, AlbertSans_700Bold });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void hydrateStorage(Object.values(STORAGE_KEYS)).then(() => {
      reloadLocale();
      setHydrated(true);
    });
  }, []);

  // A font that fails to load must not block an emergency app: fall back to the system face.
  const ready = hydrated && (fontsLoaded || fontError);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {ready ? (
        <CitizenSessionProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />
        </CitizenSessionProvider>
      ) : (
        <Launch label="" />
      )}
    </SafeAreaProvider>
  );
}
