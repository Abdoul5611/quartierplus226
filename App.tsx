import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { initMobileAds } from "./src/utils/initMobileAds";
import { AuthProvider } from "./src/context/AuthContext";
import TabNavigator from "./src/navigation/TabNavigator";

export default function App() {
  const [adsReady, setAdsReady] = useState(false);

  useEffect(() => {
    initMobileAds()
      .then(() => setAdsReady(true))
      .catch(() => setAdsReady(true));
  }, []);

  if (!adsReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AuthProvider>
          <StatusBar style="dark" backgroundColor="#FFFFFF" />
          <TabNavigator />
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
