import { Redirect } from "expo-router";
import { useCitizen } from "../citizen/session";

/** Launch route: first-time users go through onboarding, everyone else straight to the map. */
export default function Start() {
  const { onboarded } = useCitizen();
  return <Redirect href={onboarded ? "/map" : "/welcome"} />;
}
