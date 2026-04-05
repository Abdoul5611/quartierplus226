import React, { useState } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { BannerAd, BannerAdSize, TestIds } from "react-native-google-mobile-ads";

const AD_UNIT_ID = TestIds.BANNER;

export default function AdBanner() {
  const [loaded, setLoaded] = useState(false);

  return (
    <View style={[styles.container, loaded && styles.containerLoaded]}>
      <BannerAd
        unitId={AD_UNIT_ID}
        size={BannerAdSize.BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setLoaded(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E9ECEF",
    minHeight: 0,
    overflow: "hidden",
  },
  containerLoaded: {
    minHeight: 52,
  },
});
