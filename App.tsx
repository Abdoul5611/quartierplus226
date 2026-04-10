import "react-native-gesture-handler";
import React, { useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { AuthProvider } from "./src/context/AuthContext";
import TabNavigator from "./src/navigation/TabNavigator";

export default function App() {
  // DÉSACTIVÉ pour le build de test - réactiver au build suivant
  const [adsReady] = useState(true); // était: useState(Platform.OS === "web")

  // useEffect(() => {
  //   if (Platform.OS === "web") return;
  //   let cancelled = false;
  //   import("./src/utils/initMobileAds").then(({ initMobileAds }) => {
  //     initMobileAds().finally(() => {
  //       if (!cancelled) setAdsReady(true);
  //     });
  //   });
  //   return () => { cancelled = true; };
  // }, []);

  if (!adsReady) return null;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer>
          <AuthProvider>
            <StatusBar style="dark" backgroundColor="#FFFFFF" />
            <TabNavigator />
          </AuthProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
