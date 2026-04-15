import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Platform, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  Accueil: { active: "home", inactive: "home-outline" },
  Carte: { active: "map", inactive: "map-outline" },
  "Marché": { active: "storefront", inactive: "storefront-outline" },
  Portefeuille: { active: "wallet", inactive: "wallet-outline" },
  Messages: { active: "chatbubbles", inactive: "chatbubbles-outline" },
  Profil: { active: "person", inactive: "person-outline" },
  Admin: { active: "shield", inactive: "shield-outline" },
};

export default function TabNavigator() {
  const { isAdmin } = useAuth();

  return (
    <Tab.Navigator
      id="main-tab"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarStyle: {
          backgroundColor: COLORS.bg,
          borderTopWidth: 0.5,
          borderTopColor: COLORS.border,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
          paddingTop: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 16,
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons?.active : icons?.inactive;
          return (
            <View
              style={
                focused
                  ? {
                      backgroundColor: "#E8F5E9",
                      borderRadius: 14,
                      paddingHorizontal: 16,
                      paddingVertical: 4,
                      marginTop: 2,
                    }
                  : { marginTop: 2 }
              }
            >
              <Ionicons
                name={iconName || "ellipse-outline"}
                size={22}
                color={color}
              />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Accueil" component={AccueilScreen} options={{ tabBarLabel: "Accueil" }} />
      <Tab.Screen name="Carte" component={CarteScreen} options={{ tabBarLabel: "Carte" }} />
      <Tab.Screen name="Marché" component={MarcheScreen} options={{ tabBarLabel: "Marché" }} />
      <Tab.Screen name="Portefeuille" component={WalletScreen} options={{ tabBarLabel: "Wallet" }} />
      <Tab.Screen name="Messages" component={MessagesScreen} options={{ tabBarLabel: "Messages" }} />
      <Tab.Screen name="Profil" component={ProfilScreen} options={{ tabBarLabel: "Profil" }} />
      {isAdmin && (
        <Tab.Screen name="Admin" component={AdminScreen} options={{ tabBarLabel: "Admin" }} />
      )}
    </Tab.Navigator>
  );
}
