import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { AuthProvider } from "./src/context/AuthContext";
import TabNavigator from "./src/navigation/TabNavigator";

export default function App() {
  const [adsReady, setAdsReady] = useState(Platform.OS === "web");

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    import("./src/utils/initMobileAds").then(({ initMobileAds }) => {
      initMobileAds().finally(() => {
        if (!cancelled) setAdsReady(true);
      });
    });
    return () => { cancelled = true; };
  }, []);

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
