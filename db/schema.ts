import {
  pgTable,
  text,
  varchar,
  integer,
  timestamp,
  decimal,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username"),
  password: text("password").default("firebase"),
  email: text("email"),
  firebaseUid: text("firebase_uid"),
  displayName: text("display_name"),
  address: text("address"),
  quartier: text("quartier"),
  avatar: text("avatar"),
  bio: text("bio"),
  profilePhoto: text("profile_photo"),
  coverPhoto: text("cover_photo"),
  hometown: text("hometown"),
  work: text("work"),
  education: text("education"),
  points: integer("points").default(10),
  merciCount: integer("merci_count").default(0),
  lendingCount: integer("lending_count").default(0),
  walletBalance: integer("wallet_balance").default(0),
  isPremium: boolean("is_premium").default(false),
  isVerified: boolean("is_verified").default(false),
  isBanned: boolean("is_banned").default(false),
  stripeCustomerId: text("stripe_customer_id"),
  referralCode: text("referral_code"),
  referredBy: text("referred_by"),
  pushToken: text("push_token"),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  locationVisible: boolean("location_visible").default(true),
  isAdmin: boolean("is_admin").default(false),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  twoFactorSecret: text("two_factor_secret"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const posts = pgTable("posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  authorId: text("author_id"),
  authorName: text("author_name"),
  authorAvatar: text("author_avatar"),
  content: text("content"),
  imageUri: text("image_uri"),
  videoUri: text("video_uri"),
  category: text("category").default("general"),
  isEmergency: boolean("is_emergency").default(false),
  pollOptions: jsonb("poll_options"),
  isCours: boolean("is_cours").default(false),
  coursPrice: integer("cours_price"),
  paidBy: jsonb("paid_by").default([]),
  likes: jsonb("likes").default([]),
  comments: jsonb("comments").default([]),
  latitude: decimal("latitude"),
  longitude: decimal("longitude"),
  isBoosted: boolean("is_boosted").default(false),
  boostExpiresAt: timestamp("boost_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lendingItems = pgTable("lending_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title"),
  description: text("description"),
  category: text("category"),
  listingType: text("listing_type").default("pret"),
  price: integer("price"),
  ownerId: text("owner_id"),
  ownerName: text("owner_name"),
  available: boolean("available").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const serviceMissions = pgTable("service_missions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title"),
  category: text("category"),
  description: text("description"),
  missionType: text("mission_type").default("service"),
  providerId: text("provider_id"),
  providerName: text("provider_name"),
  requesterId: text("requester_id"),
  requesterName: text("requester_name"),
  price: integer("price"),
  status: text("status").default("pending"),
  confirmationCode: text("confirmation_code"),
  deliveryOtp: text("delivery_otp"),
  escrowStatus: text("escrow_status").default("none"),
  escrowTransactionId: text("escrow_transaction_id"),
  requiresVerified: boolean("requires_verified").default(false),
  rating: integer("rating"),
  ratingComment: text("rating_comment"),
  ratedBy: text("rated_by"),
  proofImageUri: text("proof_image_uri"),
  proofSubmittedAt: timestamp("proof_submitted_at"),
  validatedAt: timestamp("validated_at"),
  commissionPaid: boolean("commission_paid").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const premiumSubscriptions = pgTable("premium_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").default("active"),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id"),
  type: text("type"),
  amount: integer("amount"),
  description: text("description"),
  relatedItemId: text("related_item_id"),
  status: text("status").default("completed"),
  mobileMoney: text("mobile_money"),
  mobileMoneyProvider: text("mobile_money_provider"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sponsoredPosts = pgTable("sponsored_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessName: text("business_name"),
  title: text("title"),
  description: text("description"),
  contactPhone: text("contact_phone"),
  category: text("category"),
  paidAmount: integer("paid_amount"),
  active: boolean("active").default(true),
  startsAt: timestamp("starts_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referralBonuses = pgTable("referral_bonuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inviterId: text("inviter_id"),
  inviteeId: text("invitee_id"),
  missionId: text("mission_id"),
  bonusAmount: integer("bonus_amount"),
  status: text("status").default("credited"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const publications = pgTable("publications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id"),
  titre: text("titre").notNull(),
  contenu: text("contenu"),
  imageUrl: text("image_url"),
  audioUrl: text("audio_url"),
  quartier: text("quartier"),
  likes: integer("likes").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const marche = pgTable("marche", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendeurId: text("vendeur_id"),
  titre: text("titre").notNull(),
  description: text("description"),
  prix: decimal("prix", { precision: 10, scale: 2 }),
  imageUrl: text("image_url"),
  categorie: text("categorie"),
  disponible: boolean("disponible").default(true),
  quartier: text("quartier"),
  primePartage: boolean("prime_partage").default(false),
  primeAmount: integer("prime_amount").default(0),
  vendeurFirebaseUid: text("vendeur_firebase_uid"),
  isBoosted: boolean("is_boosted").default(false),
  boostExpiresAt: timestamp("boost_expires_at"),
  validationStatus: text("validation_status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const helpRequests = pgTable("help_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  userEmail: text("user_email"),
  userName: text("user_name"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").default("open"),
  adminResponse: text("admin_response"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  channel: text("channel").notNull().default("general"),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderAvatar: text("sender_avatar"),
  text: text("text"),
  audioUrl: text("audio_url"),
  messageType: text("message_type").default("text"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  fromUid: text("from_uid"),
  toUid: text("to_uid"),
  amount: integer("amount").notNull(),
  commission: integer("commission").default(0),
  description: text("description"),
  relatedId: text("related_id"),
  status: text("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Transaction = typeof transactions.$inferSelect;

export const videoViews = pgTable("video_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userUid: text("user_uid").notNull(),
  pointsEarned: integer("points_earned").default(100),
  viewedAt: timestamp("viewed_at").defaultNow(),
});

export const votes = pgTable("votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: text("post_id").notNull(),
  userId: text("user_id").notNull(),
  optionIndex: integer("option_index").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lotoTickets = pgTable("loto_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userUid: text("user_uid").notNull(),
  chosenNumbers: jsonb("chosen_numbers").notNull(),
  drawnNumbers: jsonb("drawn_numbers").notNull(),
  matchedCount: integer("matched_count").notNull().default(0),
  prizeAmount: integer("prize_amount").notNull().default(0),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;

export type LotoTicket = typeof lotoTickets.$inferSelect;
export type NewLotoTicket = typeof lotoTickets.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Publication = typeof publications.$inferSelect;
export type NewPublication = typeof publications.$inferInsert;
export type Marche = typeof marche.$inferSelect;
export type NewMarche = typeof marche.$inferInsert;
export type HelpRequest = typeof helpRequests.$inferSelect;
export type NewHelpRequest = typeof helpRequests.$inferInsert;
