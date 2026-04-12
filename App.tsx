import 'react-native-gesture-handler';
import { GestureHandlerRootView } from "react-native-gesture-handler";
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { AuthProvider } from "./src/context/AuthContext";
import TabNavigator from "./src/navigation/TabNavigator";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <AuthProvider>
          <SafeAreaProvider>
            <NavigationContainer>
              <StatusBar style="dark" backgroundColor="#FFFFFF" />
              <TabNavigator />
            </NavigationContainer>
          </SafeAreaProvider>
        </AuthProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}