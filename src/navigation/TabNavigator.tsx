import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View, StyleSheet, Platform } from "react-native";
import AccueilScreen from "../screens/AccueilScreen";
import CarteScreen from "../screens/CarteScreen";
import MarcheScreen from "../screens/MarcheScreen";
import MessagesScreen from "../screens/MessagesScreen";
import ProfilScreen from "../screens/ProfilScreen";
import WalletScreen from "../screens/WalletScreen";
import AdminScreen from "../screens/AdminScreen";
import { useAuth } from "../context/AuthContext";

const Tab = createBottomTabNavigator();

const COLORS = {
  primary: "#2E7D32",
  inactive: "#9E9E9E",
  bg: "#FFFFFF",
  border: "#E9ECEF",
};

interface TabIconProps {
  icon: string;
  label: string;
  focused: boolean;
}

function TabIcon({ icon, label, focused }: TabIconProps) {
  return (
    <View style={[styles.tabItem, focused && styles.tabItemFocused]}>
      <Text style={[styles.tabEmoji, focused && styles.tabEmojiFocused]}>{icon}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{label}</Text>
    </View>
  );
}

export default function TabNavigator() {
  const { isAdmin } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Accueil"
        component={AccueilScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🏠" label="Accueil" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Carte"
        component={CarteScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🗺️" label="Carte" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Marché"
        component={MarcheScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🛒" label="Marché" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Portefeuille"
        component={WalletScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="💰" label="Wallet" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="💬" label="Messages" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Profil"
        component={ProfilScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="👤" label="Profil" focused={focused} />
          ),
        }}
      />
      {isAdmin && (
        <Tab.Screen
          name="Admin"
          component={AdminScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon icon="🛡️" label="Admin" focused={focused} />
            ),
          }}
        />
      )}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    height: Platform.OS === "ios" ? 90 : 70,
    paddingBottom: Platform.OS === "ios" ? 20 : 8,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 56,
  },
  tabItemFocused: {
    backgroundColor: "#E8F5E9",
  },
  tabEmoji: {
    fontSize: 22,
    opacity: 0.6,
  },
  tabEmojiFocused: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 10,
    color: COLORS.inactive,
    marginTop: 2,
    fontWeight: "600",
  },
  tabLabelFocused: {
    color: COLORS.primary,
    fontWeight: "800",
  },
});
