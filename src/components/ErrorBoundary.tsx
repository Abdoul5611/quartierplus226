import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[QuartierPlus] Erreur capturée par ErrorBoundary:", error.message);
    console.error("[QuartierPlus] Stack:", info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>😕</Text>
          <Text style={styles.title}>Oops, quelque chose s'est mal passé</Text>
          <Text style={styles.message}>
            {this.state.error?.message || "Erreur inconnue"}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={this.handleRetry}>
            <Text style={styles.btnText}>🔄 Réessayer</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Si le problème persiste, contactez{"\n"}abdoulquartierplus@gmail.com
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0FFF4",
    padding: 32,
  },
  emoji: { fontSize: 72, marginBottom: 24 },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1A1A2E",
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    fontSize: 13,
    color: "#6C757D",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 32,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    backgroundColor: "#E8F5E9",
    padding: 12,
    borderRadius: 8,
  },
  btn: {
    backgroundColor: "#2E7D32",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginBottom: 20,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  hint: {
    fontSize: 12,
    color: "#9E9E9E",
    textAlign: "center",
    lineHeight: 18,
  },
});
