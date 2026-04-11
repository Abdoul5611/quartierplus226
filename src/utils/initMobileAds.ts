let _adsReady = false;

export function adsReady(): boolean {
  return _adsReady;
}

export async function initMobileAds(): Promise<void> {
  // AdMob désactivé - sera réactivé après validation du build de test
}
