import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { BASE_URL } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(firebaseUid: string): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

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
  onReceived: (n: Notifications.Notification) => void,
  onResponse: (r: Notifications.NotificationResponse) => void
) {
  const s1 = Notifications.addNotificationReceivedListener(onReceived);
  const s2 = Notifications.addNotificationResponseReceivedListener(onResponse);
  return () => { s1.remove(); s2.remove(); };
}
