import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";

const COLORS = {
  primary: "#2E7D32",
  primaryLight: "#E8F5E9",
  gold: "#F9A825",
  goldLight: "#FFF8E1",
  blue: "#1565C0",
  blueLight: "#E3F2FD",
  red: "#C62828",
  redLight: "#FFEBEE",
  bg: "#F5F5F5",
  card: "#FFFFFF",
  text: "#212121",
  textSub: "#757575",
  border: "#E0E0E0",
  disabled: "#BDBDBD",
};

interface GameCard {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  bgColor: string;
  cost: string;
  maxWin: string;
  route: string | null;
  available: boolean;
}

const GAMES: GameCard[] = [
  {
    id: "loto",
    title: "Loto 5/30",
    subtitle: "Choisissez 5 numéros parmi 30 et tentez le JACKPOT !",
    icon: "dice",
    color: COLORS.primary,
    bgColor: COLORS.primaryLight,
    cost: "100 FCFA",
    maxWin: "50 000 FCFA",
    route: "Loto",
    available: true,
  },
  {
    id: "scratch",
    title: "Grattage Instantané",
    subtitle: "Grattez et découvrez vos gains en quelques secondes.",
    icon: "layers-outline",
    color: COLORS.gold,
    bgColor: COLORS.goldLight,
    cost: "50 FCFA",
    maxWin: "10 000 FCFA",
    route: null,
    available: false,
  },
  {
    id: "quiz",
    title: "Quiz Quartier",
    subtitle: "Testez vos connaissances sur votre quartier et gagnez.",
    icon: "help-circle-outline",
    color: COLORS.blue,
    bgColor: COLORS.blueLight,
    cost: "25 FCFA",
    maxWin: "5 000 FCFA",
    route: null,
    available: false,
  },
  {
    id: "duel",
    title: "Duel de Voisins",
    subtitle: "Affrontez un voisin en duel de questions sur le quartier.",
    icon: "people-outline",
    color: COLORS.red,
    bgColor: COLORS.redLight,
    cost: "100 FCFA",
    maxWin: "1 800 FCFA",
    route: null,
    available: false,
  },
  {
    id: "course",
    title: "Course de Rue",
    subtitle: "Pariez sur votre coureur favori. Système Pari Mutuel — cagnotte partagée !",
    icon: "flag",
    color: "#E65100",
    bgColor: "#FFF3E0",
    cost: "min. 50 FCFA",
    maxWin: "Cagnotte commune",
    route: "CourseDeRue",
    available: true,
  },
  {
    id: "prediction",
    title: "Prédictions",
    subtitle: "Pariez sur des événements locaux (météo, marché, sport).",
    icon: "trending-up-outline",
    color: "#7B1FA2",
    bgColor: "#F3E5F5",
    cost: "50 FCFA",
    maxWin: "Illimité",
    route: null,
    available: false,
  },
];

export default function JeuxScreen() {
  const navigation = useNavigation<any>();
  const { dbUser } = useAuth() as any;
  const balance = dbUser?.wallet_balance ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎮 Jeux QuartierPlus</Text>
        <Text style={styles.headerSub}>Gagnez des FCFA en jouant !</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.walletCard}>
          <Ionicons name="wallet-outline" size={20} color={COLORS.primary} />
          <View style={styles.walletInfo}>
            <Text style={styles.walletLabel}>Votre solde</Text>
            <Text style={styles.walletBalance}>{balance.toLocaleString("fr-FR")} FCFA</Text>
          </View>
          {balance < 100 && (
            <TouchableOpacity
              style={styles.rechargeBtn}
              onPress={() => navigation.navigate("Profil")}
            >
              <Text style={styles.rechargeBtnText}>Recharger</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionTitle}>Jeux disponibles</Text>

        {GAMES.map((game) => (
          <TouchableOpacity
            key={game.id}
            style={[styles.gameCard, !game.available && styles.gameCardDisabled]}
            onPress={() => game.available && game.route && navigation.navigate(game.route)}
            activeOpacity={game.available ? 0.8 : 1}
            disabled={!game.available}
          >
            <View style={[styles.gameIconBox, { backgroundColor: game.available ? game.bgColor : "#F5F5F5" }]}>
              <Ionicons
                name={game.icon as any}
                size={28}
                color={game.available ? game.color : COLORS.disabled}
              />
            </View>
            <View style={styles.gameInfo}>
              <View style={styles.gameTitleRow}>
                <Text style={[styles.gameTitle, !game.available && { color: COLORS.disabled }]}>
                  {game.title}
                </Text>
                {!game.available && (
                  <View style={styles.comingSoon}>
                    <Text style={styles.comingSoonText}>Bientôt</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.gameSub, !game.available && { color: COLORS.disabled }]} numberOfLines={2}>
                {game.subtitle}
              </Text>
              <View style={styles.gameStats}>
                <View style={styles.gameStat}>
                  <Ionicons name="ticket-outline" size={12} color={game.available ? COLORS.textSub : COLORS.disabled} />
                  <Text style={[styles.gameStatText, !game.available && { color: COLORS.disabled }]}>
                    {game.cost}
                  </Text>
                </View>
                <View style={styles.gameStat}>
                  <Ionicons name="trophy-outline" size={12} color={game.available ? COLORS.gold : COLORS.disabled} />
                  <Text style={[styles.gameStatText, { color: game.available ? COLORS.gold : COLORS.disabled }, { fontWeight: "700" }]}>
                    Max {game.maxWin}
                  </Text>
                </View>
              </View>
            </View>
            {game.available && (
              <Ionicons name="chevron-forward" size={20} color={COLORS.textSub} />
            )}
          </TouchableOpacity>
        ))}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Pour jouer, vous devez avoir du crédit dans votre portefeuille. Regardez des publicités vidéo dans votre Profil pour gagner des FCFA gratuitement.
          </Text>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingTop: Platform.OS === "ios" ? 56 : 20,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: COLORS.card,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  headerSub: { fontSize: 13, color: COLORS.textSub, marginTop: 2 },
  scroll: { padding: 16 },
  walletCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  walletInfo: { flex: 1 },
  walletLabel: { fontSize: 12, color: COLORS.primary, fontWeight: "600" },
  walletBalance: { fontSize: 20, fontWeight: "800", color: COLORS.primary },
  rechargeBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rechargeBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textSub,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  gameCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
  },
  gameCardDisabled: { opacity: 0.6 },
  gameIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  gameInfo: { flex: 1 },
  gameTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  gameTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  gameSub: { fontSize: 12, color: COLORS.textSub, lineHeight: 17 },
  gameStats: { flexDirection: "row", gap: 12, marginTop: 6 },
  gameStat: { flexDirection: "row", alignItems: "center", gap: 3 },
  gameStatText: { fontSize: 12, color: COLORS.textSub },
  comingSoon: {
    backgroundColor: "#EDE7F6",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  comingSoonText: { fontSize: 10, fontWeight: "700", color: "#7B1FA2" },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: COLORS.primaryLight,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: 8,
  },
  infoText: { flex: 1, fontSize: 12, color: COLORS.primary, lineHeight: 18 },
});
