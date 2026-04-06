import mobileAds from "react-native-google-mobile-ads";

export async function initMobileAds(): Promise<void> {
  await mobileAds().initialize();
}
