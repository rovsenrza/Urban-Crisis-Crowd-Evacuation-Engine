import { Stack } from "expo-router";
import { color } from "../../design/theme";
import { OperatorSessionProvider } from "../../operator/session";

/** Holds the dispatcher session above sign-in and the console; its socket only lives while this section is open. */
export default function OperatorRoot() {
  return (
    <OperatorSessionProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />
    </OperatorSessionProvider>
  );
}
