import { pgTable, text, serial, timestamp, real, jsonb } from "drizzle-orm/pg-core";

export const signalsTable = pgTable("signals", {
  id: serial("id").primaryKey(),
  coin: text("coin").notNull(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  risk_level: text("risk_level").notNull(),
  confidence: real("confidence").notNull(),
  normalized_score: real("normalized_score").notNull(),
  raw_score: real("raw_score").notNull(),
  technical_score: real("technical_score").notNull().default(0),
  derivatives_score: real("derivatives_score").notNull().default(0),
  onchain_score: real("onchain_score").notNull().default(0),
  macro_score: real("macro_score").notNull().default(0),
  current_price: real("current_price").notNull(),
  entry_low: real("entry_low").notNull(),
  entry_high: real("entry_high").notNull(),
  stop_loss: real("stop_loss").notNull(),
  tp1: real("tp1").notNull(),
  tp2: real("tp2").notNull(),
  tp3: real("tp3").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  layer_details: jsonb("layer_details"),
  api_warnings: jsonb("api_warnings"),
  ai_verdict: text("ai_verdict"),
  ai_reason: text("ai_reason"),
  ai_key_risk: text("ai_key_risk"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  closed_at: timestamp("closed_at"),
  close_price: real("close_price"),
});

export type Signal = typeof signalsTable.$inferSelect;
export type InsertSignal = typeof signalsTable.$inferInsert;
