import mobileAds from "react-native-google-mobile-ads";

let _adsReady = false;

export function adsReady(): boolean {
  return _adsReady;
}

export async function initMobileAds(): Promise<void> {
  try {
    await mobileAds().initialize();
    _adsReady = true;
  } catch (e: any) {
    console.warn("[QuartierPlus] AdMob init warning:", e?.message);
    _adsReady = false;
  }
}
