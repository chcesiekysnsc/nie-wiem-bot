-- ============================================================
-- MIGRACJA BOTA NA POSTGRESQL — SCHEMA PRODUKCYJNA
-- Wklej całość w Supabase SQL Editor i kliknij Run.
-- ============================================================

-- ============================================================
-- 1. UŻYTKOWNICY
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  messenger_id VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(100),
  balance BIGINT DEFAULT 0,
  bank BIGINT DEFAULT 0,
  level INT DEFAULT 1,
  xp BIGINT DEFAULT 0,
  prestige INT DEFAULT 0,
  badges TEXT[] DEFAULT '{}',
  married_to BIGINT REFERENCES users(id),
  daily_cooldown TIMESTAMP,
  message_count BIGINT DEFAULT 0,
  group_messages JSONB DEFAULT '{}',
  command_counts JSONB DEFAULT '{}',
  company_id BIGINT,
  company2_id BIGINT,
  gang_id BIGINT,
  last_active_thread_id VARCHAR(64),
  default_city VARCHAR(100),
  opened_packages_today INT DEFAULT 0,
  last_package_open_date DATE,
  negative_since TIMESTAMP,
  active_loan JSONB,
  blacklisted_for_negative_balance BOOLEAN DEFAULT false,
  claimed_milestones JSONB DEFAULT '[]',
  bio TEXT DEFAULT '',
  last_work_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_messenger ON users(messenger_id);
CREATE INDEX IF NOT EXISTS idx_users_balance ON users(balance DESC);
CREATE INDEX IF NOT EXISTS idx_users_gang ON users(gang_id);

-- ============================================================
-- 2. STATYSTYKI UŻYTKOWNIKÓW (dynamiczne)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_stats (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  stat_name VARCHAR(50) NOT NULL,
  value NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, stat_name)
);

CREATE INDEX IF NOT EXISTS idx_user_stats_user ON user_stats(user_id);

-- ============================================================
-- 3. EKWIPUNEK
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(50) NOT NULL,
  amount INT DEFAULT 0,
  obtained_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(user_id);

-- ============================================================
-- 4. DEFINICJE ITEMÓW (game content)
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  emoji VARCHAR(10),
  description TEXT,
  rarity VARCHAR(20) DEFAULT 'common',
  category VARCHAR(50),
  effect_type VARCHAR(50),
  effect_value NUMERIC DEFAULT 0,
  buyable BOOLEAN DEFAULT true,
  shop_note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_effect ON items(effect_type);

-- ============================================================
-- 5. EFEKTY UŻYTKOWNIKÓW (aktywne buffy/debuffy)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_effects (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  effect_type VARCHAR(50) NOT NULL,
  source_item_id VARCHAR(50) REFERENCES items(id),
  value NUMERIC DEFAULT 0,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, effect_type, source_item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_effects_user ON user_effects(user_id);
CREATE INDEX IF NOT EXISTS idx_user_effects_type ON user_effects(effect_type);

-- ============================================================
-- 6. GANGI
-- ============================================================
CREATE TABLE IF NOT EXISTS gangs (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  boss_id BIGINT REFERENCES users(id),
  vault BIGINT DEFAULT 0,
  level_dziupla INT DEFAULT 0,
  level_biznesy INT DEFAULT 0,
  level_fach INT DEFAULT 0,
  reputation INT DEFAULT 0,
  tribute_percent INT DEFAULT 0,
  last_heist_time TIMESTAMP,
  last_attack_time TIMESTAMP,
  last_territory_capture_at TIMESTAMP,
  shield_until TIMESTAMP,
  last_support_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gangs_boss ON gangs(boss_id);

-- ============================================================
-- 7. CZŁonkowie gangu
-- ============================================================
CREATE TABLE IF NOT EXISTS gang_members (
  gang_id BIGINT REFERENCES gangs(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (gang_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gang_members_user ON gang_members(user_id);
CREATE INDEX IF NOT EXISTS idx_gang_members_gang ON gang_members(gang_id);

-- ============================================================
-- 8. DEPOZYTY W GANGU
-- ============================================================
CREATE TABLE IF NOT EXISTS gang_deposits (
  gang_id BIGINT REFERENCES gangs(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  amount BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (gang_id, user_id)
);

-- ============================================================
-- 9. TERYTORIA - DEFINICJE
-- ============================================================
CREATE TABLE IF NOT EXISTS territory_definitions (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  emoji VARCHAR(10),
  description TEXT,
  bonus_type VARCHAR(50),
  bonus_value NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 10. TERYTORIA - STAN AKTYWNY
-- ============================================================
CREATE TABLE IF NOT EXISTS territories (
  id BIGSERIAL PRIMARY KEY,
  definition_id VARCHAR(50) NOT NULL REFERENCES territory_definitions(id),
  owner_gang_id BIGINT REFERENCES gangs(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  captured_at TIMESTAMP,
  next_rotation_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_territories_active ON territories(is_active, definition_id);
CREATE INDEX IF NOT EXISTS idx_territories_owner ON territories(owner_gang_id);

-- ============================================================
-- 11. ULEPSZENIA GANGÓW
-- ============================================================
CREATE TABLE IF NOT EXISTS gang_upgrades (
  gang_id BIGINT REFERENCES gangs(id) ON DELETE CASCADE,
  upgrade_type VARCHAR(50) NOT NULL,
  level INT DEFAULT 0,
  purchased_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (gang_id, upgrade_type)
);

-- ============================================================
-- 12. SOJUSZE GANGÓW
-- ============================================================
CREATE TABLE IF NOT EXISTS gang_alliances (
  gang_id BIGINT REFERENCES gangs(id) ON DELETE CASCADE,
  ally_gang_id BIGINT REFERENCES gangs(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (gang_id, ally_gang_id)
);

-- ============================================================
-- 13. FIRMY
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  level INT DEFAULT 1,
  income JSONB DEFAULT '{}',
  last_claim TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_owner ON companies(owner_id);

-- ============================================================
-- 14. PRACOWNICY FIRM
-- ============================================================
CREATE TABLE IF NOT EXISTS company_employees (
  company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'worker',
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (company_id, user_id)
);

-- ============================================================
-- 15. COOLDOWNY KOMEND
-- ============================================================
CREATE TABLE IF NOT EXISTS command_cooldowns (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  command_name VARCHAR(50) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  PRIMARY KEY (user_id, command_name)
);

CREATE INDEX IF NOT EXISTS idx_cooldowns_user ON command_cooldowns(user_id, expires_at);

-- ============================================================
-- 16. SPAM
-- ============================================================
CREATE TABLE IF NOT EXISTS spam_entries (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  timestamps TIMESTAMP[] DEFAULT '{}',
  blocked_until TIMESTAMP,
  warning_count INT DEFAULT 0,
  blacklisted BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 17. EVENTY GRY
-- ============================================================
CREATE TABLE IF NOT EXISTS game_events (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  multiplier NUMERIC DEFAULT 1,
  cooldown_reduction NUMERIC DEFAULT 0,
  discount_percent INT DEFAULT 0,
  reward_multiplier NUMERIC DEFAULT 1,
  requirements JSONB DEFAULT '{}',
  starts_at TIMESTAMP DEFAULT NOW(),
  ends_at TIMESTAMP,
  active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_events_active ON game_events(active, starts_at, ends_at);

-- ============================================================
-- 18. KONFIGURACJA GRY (klucz-wartość)
-- ============================================================
CREATE TABLE IF NOT EXISTS game_config (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT,
  value_type VARCHAR(20) DEFAULT 'string',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 19. GRUPY
-- ============================================================
CREATE TABLE IF NOT EXISTS groups (
  thread_id VARCHAR(64) PRIMARY KEY,
  prefix VARCHAR(10) DEFAULT '!',
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 20. STATYSTYKI GRUP
-- ============================================================
CREATE TABLE IF NOT EXISTS group_stats (
  thread_id VARCHAR(64) PRIMARY KEY,
  thread_name VARCHAR(200),
  visible_messages BIGINT DEFAULT 0,
  processed_messages BIGINT DEFAULT 0,
  commands_executed BIGINT DEFAULT 0,
  mentions_count BIGINT DEFAULT 0,
  first_use TIMESTAMP,
  last_updated TIMESTAMP,
  seen_message_ids JSONB DEFAULT '[]'
);

-- ============================================================
-- 21. AKTYWNE ZAKŁADY
-- ============================================================
CREATE TABLE IF NOT EXISTS active_bets (
  id BIGSERIAL PRIMARY KEY,
  thread_id VARCHAR(64) NOT NULL,
  host_id BIGINT REFERENCES users(id),
  game_type VARCHAR(50) NOT NULL,
  stake BIGINT NOT NULL,
  players JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bets_thread ON active_bets(thread_id);

-- ============================================================
-- 22. TRANSAKCJE (historia ekonomiczna)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  type VARCHAR(50) NOT NULL,
  reason TEXT,
  balance_after BIGINT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- ============================================================
-- 23. LOGI
-- ============================================================
CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  thread_id VARCHAR(64),
  action VARCHAR(100) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_thread ON logs(thread_id);

-- ============================================================
-- 24. WERSJA BAZY DANYCH
-- ============================================================
CREATE TABLE IF NOT EXISTS database_version (
  version VARCHAR(20) PRIMARY KEY,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO database_version (version) VALUES ('1.0.0') ON CONFLICT (version) DO NOTHING;

-- ============================================================
-- 25. CZARNA LISTA
-- ============================================================
CREATE TABLE IF NOT EXISTS blacklist (
  user_id VARCHAR(64) PRIMARY KEY,
  reason TEXT,
  banned_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 26. ZAKAZANE GRUPY
-- ============================================================
CREATE TABLE IF NOT EXISTS blacklisted_groups (
  thread_id VARCHAR(64) PRIMARY KEY,
  reason TEXT,
  banned_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 27. USTAWIENIA WĄTKÓW
-- ============================================================
CREATE TABLE IF NOT EXISTS thread_settings (
  thread_id VARCHAR(64) PRIMARY KEY,
  prefix VARCHAR(10) DEFAULT '!',
  loop_users JSONB DEFAULT '[]',
  nickname_guards JSONB DEFAULT '{}',
  unsend_logging_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 28. POŻYCZKI GRACZY
-- ============================================================
CREATE TABLE IF NOT EXISTS player_loans (
  id BIGSERIAL PRIMARY KEY,
  borrower_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  lender_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  interest_rate NUMERIC DEFAULT 0,
  due_date TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_borrower ON player_loans(borrower_id);
CREATE INDEX IF NOT EXISTS idx_loans_lender ON player_loans(lender_id);

-- ============================================================
-- 29. BAZA ZAKAZÓW KOMEND (per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_command_permissions (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  command_name VARCHAR(50) NOT NULL,
  allowed BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, command_name)
);

-- ============================================================
-- 30. AFK UŻYTKOWNIKÓW
-- ============================================================
CREATE TABLE IF NOT EXISTS afk_users (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
  reason TEXT,
  enabled BOOLEAN DEFAULT true,
  time TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 31. OVERRIDE SZANS (cheat/development)
-- ============================================================
CREATE TABLE IF NOT EXISTS chance_overrides (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
  crime_success NUMERIC,
  rob_success NUMERIC,
  work_luck NUMERIC,
  box_drop_luck NUMERIC,
  company_breakdown NUMERIC,
  gang_heist_success NUMERIC,
  lottery_ticket_mult NUMERIC,
  gielda_luck NUMERIC,
  coinflip_win NUMERIC,
  roulette_win_luck NUMERIC,
  slots_win_luck NUMERIC,
  rr_solo_survive NUMERIC,
  rr_duel_bullet NUMERIC,
  blackjack_save_luck NUMERIC,
  bet_win_luck NUMERIC,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 32. GRY BLACKJACK (aktywne)
-- ============================================================
CREATE TABLE IF NOT EXISTS active_blackjack_games (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
  bet BIGINT NOT NULL,
  player_cards JSONB DEFAULT '[]',
  dealer_cards JSONB DEFAULT '[]',
  deck JSONB DEFAULT '[]',
  thread_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 33. KONTEKSTY AI
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_group_cooldowns (
  thread_id VARCHAR(64) PRIMARY KEY,
  last_used TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 34. MNOŻNIKI EVENTÓW KASYNNYCH
-- ============================================================
CREATE TABLE IF NOT EXISTS event_casino_multi_bet_usage (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
  usage_count INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 35. MODERACJA PROPOZYCJI
-- ============================================================
CREATE TABLE IF NOT EXISTS proposal_moderation (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
  warnings INT DEFAULT 0,
  banned BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 36. KONFIGURACJA GRY - CLAN/GANG TAXES
-- ============================================================
CREATE TABLE IF NOT EXISTS game_taxes (
  id SERIAL PRIMARY KEY,
  tax_type VARCHAR(50) UNIQUE NOT NULL,
  rate NUMERIC DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO game_taxes (tax_type, rate) VALUES
  ('balance', 15),
  ('transfer', 5),
  ('market', 10),
  ('gang_tribute', 0),
  ('casino', 15),
  ('mecz', 15)
ON CONFLICT (tax_type) DO NOTHING;

-- ============================================================
-- 37. RYNEK (aukcje graczy)
-- ============================================================
CREATE TABLE IF NOT EXISTS market_listings (
  listing_id VARCHAR(50) PRIMARY KEY,
  seller_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(50) NOT NULL,
  price BIGINT NOT NULL,
  listed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_seller ON market_listings(seller_id);

-- ============================================================
-- 38. ZWYCIĘZCY MIESIĘCZNI
-- ============================================================
CREATE TABLE IF NOT EXISTS monthly_winners (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  period VARCHAR(20) NOT NULL,
  total BIGINT DEFAULT 0,
  item VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_winners_period ON monthly_winners(period);

-- ============================================================
-- 39. POŁĄCZENIA LAST.FM
-- ============================================================
CREATE TABLE IF NOT EXISTS lastfm_connections (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  incognito BOOLEAN DEFAULT false,
  connected_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 40. BOT STATUS
-- ============================================================
CREATE TABLE IF NOT EXISTS bot_status (
  id INT PRIMARY KEY DEFAULT 1,
  logged_in BOOLEAN DEFAULT false,
  bot_id VARCHAR(64),
  active_threads INT DEFAULT 0,
  last_heartbeat TIMESTAMP DEFAULT NOW()
);

INSERT INTO bot_status (id, logged_in, bot_id, active_threads) VALUES (1, false, null, 0) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TRIGGERY
-- ============================================================

-- Automatycznie aktualizuj updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_gangs_updated_at BEFORE UPDATE ON gangs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_user_stats_updated_at BEFORE UPDATE ON user_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_gang_deposits_updated_at BEFORE UPDATE ON gang_deposits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_chance_overrides_updated_at BEFORE UPDATE ON chance_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_player_loans_updated_at BEFORE UPDATE ON player_loans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_lastfm_connections_updated_at BEFORE UPDATE ON lastfm_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- KONIEC SCHEMA
-- ============================================================
