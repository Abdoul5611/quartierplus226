import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { initMobileAds } from "./src/utils/initMobileAds";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { AuthProvider } from "./src/context/AuthContext";
import TabNavigator from "./src/navigation/TabNavigator";

export default function App() {
  useEffect(() => {
    initMobileAds();
  }, []);

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
