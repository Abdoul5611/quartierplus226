import { Platform } from "react-native";
import { BASE_URL } from "./api";

async function getNotifications() {
  if (Platform.OS === "web") return null;
  return import("expo-notifications");
}

getNotifications().then((Notifications) => {
  Notifications?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
});

export async function registerForPushNotifications(firebaseUid: string): Promise<string | null> {
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return null;

    let permissionsResult: any = await Notifications.getPermissionsAsync();

    if (!permissionsResult.granted) {
      permissionsResult = await Notifications.requestPermissionsAsync();
    }

    if (!permissionsResult.granted) return null;

    const tokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
    if (!tokenData) return null;

    const token = tokenData.data;

    await fetch(`${BASE_URL}/api/users/${firebaseUid}/push-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => {});

    return token;
  } catch {
    return null;
  }
}

export function addNotificationListener(
  onReceived: (n: any) => void,
  onResponse: (r: any) => void
) {
  if (Platform.OS === "web") return () => {};
  let cleanup = () => {};
  getNotifications().then((Notifications) => {
    if (!Notifications) return;
    const s1 = Notifications.addNotificationReceivedListener(onReceived);
    const s2 = Notifications.addNotificationResponseReceivedListener(onResponse);
    cleanup = () => { s1.remove(); s2.remove(); };
  });
  return () => cleanup();
}
