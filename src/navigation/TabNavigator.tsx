import React, { useEffect, useRef, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Platform, View, Text, StyleSheet, TouchableOpacity, Animated, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import AccueilScreen from "../screens/AccueilScreen";
import CarteScreen from "../screens/CarteScreen";
import MarcheScreen from "../screens/MarcheScreen";
import MessagesScreen from "../screens/MessagesScreen";
import ProfilScreen from "../screens/ProfilScreen";
import AdminScreen from "../screens/AdminScreen";
import WalletScreen from "../screens/WalletScreen";
import JeuxScreen from "../screens/JeuxScreen";
import LotoScreen from "../screens/LotoScreen";
import CourseDeRueScreen from "../screens/CourseDeRueScreen";
import CourseAgiliteScreen from "../screens/CourseAgiliteScreen";
import LiveQuizScreen from "../screens/LiveQuizScreen";
import ScratchScreen from "../screens/ScratchScreen";
import QuizQuartierScreen from "../screens/QuizQuartierScreen";
import KenoScreen from "../screens/KenoScreen";
import { useAuth } from "../context/AuthContext";
import { BASE_URL } from "../services/api";
import { addNotificationListener } from "../services/notifications";

const Tab = createBottomTabNavigator();
const JeuxStack = createNativeStackNavigator();

function getWsUrl(): string {
  if (Platform.OS === "web") {
    const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost:5000";
    return `${proto}//${host}`;
  }
  return BASE_URL.replace("https://", "wss://").replace("http://", "ws://");
}

interface FlashMsg { title: string; message: string; }

function GlobalFlashListener() {
  const wsRef = useRef<WebSocket | null>(null);
  const [flash, setFlash] = useState<FlashMsg | null>(null);
  const slideAnim = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    function connect() {
      if (!alive) return;
      try {
        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === "flash_message") {
              setFlash({ title: data.title || "📢 Message", message: data.message });
              Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
              setTimeout(() => {
                Animated.timing(slideAnim, { toValue: -120, duration: 400, useNativeDriver: true }).start(() => setFlash(null));
              }, 6000);
            }
          } catch {}
        };

        ws.onclose = () => {
          if (alive) reconnectTimeout = setTimeout(connect, 8000);
        };
        ws.onerror = () => { ws.close(); };
      } catch {}
    }

    connect();
    return () => {
      alive = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, []);

  if (!flash) return null;

  return (
    <Animated.View style={[styles.flashBanner, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.flashIcon}>
        <Text style={{ fontSize: 22 }}>📢</Text>
      </View>
      <View style={styles.flashContent}>
        <Text style={styles.flashTitle}>{flash.title}</Text>
        <Text style={styles.flashMessage} numberOfLines={3}>{flash.message}</Text>
      </View>
      <TouchableOpacity onPress={() => {
        Animated.timing(slideAnim, { toValue: -120, duration: 300, useNativeDriver: true }).start(() => setFlash(null));
      }}>
        <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
    </Animated.View>
  );
}

function NotificationHandler() {
  const navigation = useNavigation<any>();

  useEffect(() => {
    const cleanup = addNotificationListener(
      (_notification) => {
        // Notification reçue en avant-plan : le GlobalFlashListener WebSocket gère déjà l'affichage
      },
      (response) => {
        const data = response.notification.request.content.data as any;
        if (data?.type === "new_dm" || data?.type === "new_message") {
          navigation.navigate("Messages");
        } else if (
          data?.type === "new_post" ||
          data?.type === "new_comment" ||
          data?.type === "new_like"
        ) {
          navigation.navigate("Accueil");
        }
      }
    );
    return cleanup;
  }, []);

  return null;
}

function JeuxNavigator() {
  return (
    <JeuxStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
        gestureDirection: "horizontal",
        fullScreenGestureEnabled: true,
        animationDuration: 280,
        contentStyle: { backgroundColor: "#F5F5F5" },
      }}
    >
      <JeuxStack.Screen name="JeuxHub" component={JeuxScreen} />
      <JeuxStack.Screen name="Loto" component={LotoScreen} />
      <JeuxStack.Screen name="CourseDeRue" component={CourseDeRueScreen} />
      <JeuxStack.Screen name="CourseAgilite" component={CourseAgiliteScreen} />
      <JeuxStack.Screen name="LiveQuiz" component={LiveQuizScreen} />
      <JeuxStack.Screen name="Scratch" component={ScratchScreen} />
      <JeuxStack.Screen name="QuizQuartier" component={QuizQuartierScreen} />
      <JeuxStack.Screen name="Keno" component={KenoScreen} />
    </JeuxStack.Navigator>
  );
}

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
  Jeux: { active: "game-controller", inactive: "game-controller-outline" },
  Messages: { active: "chatbubbles", inactive: "chatbubbles-outline" },
  Profil: { active: "person", inactive: "person-outline" },
  Admin: { active: "shield", inactive: "shield-outline" },
};

export default function TabNavigator() {
  const { isAdmin } = useAuth();

  return (
    <View style={{ flex: 1 }}>
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
          tabBarIcon: ({ focused, color }) => {
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
        <Tab.Screen name="Jeux" component={JeuxNavigator} options={{ tabBarLabel: "Jeux" }} />
        <Tab.Screen name="Messages" component={MessagesScreen} options={{ tabBarLabel: "Messages" }} />
        <Tab.Screen name="Profil" component={ProfilScreen} options={{ tabBarLabel: "Profil" }} />
        {isAdmin && (
          <Tab.Screen name="Admin" component={AdminScreen} options={{ tabBarLabel: "Admin" }} />
        )}
        <Tab.Screen
          name="Portefeuille"
          component={WalletScreen}
          options={{ tabBarButton: () => null, tabBarStyle: { display: "none" } }}
        />
      </Tab.Navigator>
      <GlobalFlashListener />
      <NotificationHandler />
    </View>
  );
}

const styles = StyleSheet.create({
  flashBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1B5E20",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: Platform.OS === "ios" ? 54 : 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 9999,
  },
  flashIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  flashContent: { flex: 1 },
  flashTitle: { fontSize: 14, fontWeight: "800", color: "#fff" },
  flashMessage: { fontSize: 13, color: "rgba(255,255,255,0.9)", marginTop: 2, lineHeight: 18 },
});
