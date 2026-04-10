// import mobileAds from "react-native-google-mobile-ads"; // DÉSACTIVÉ - build de test sans pubs

let _adsReady = false;

export function adsReady(): boolean {
  return _adsReady;
}

export async function initMobileAds(): Promise<void> {
  // DÉSACTIVÉ pour le build de test - réactiver au build suivant
  // try {
  //   await mobileAds().initialize();
  //   _adsReady = true;
  // } catch (e: any) {
  //   console.warn("[QuartierPlus] AdMob init warning:", e?.message);
  //   _adsReady = false;
  // }
}
