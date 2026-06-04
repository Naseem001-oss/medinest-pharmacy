-- MEDINEST PHARMACY - SUPABASE DATABASE MIGRATION SCRIPT
-- RUN THIS IN YOUR SUPABASE PROJECT SQL EDITOR TO CREATE TABLES & DISABLE RLS

-- 1. CLEANUP LEGACY CONFIGURATION (IF EXISTS)
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS refill_reminders CASCADE;
DROP TABLE IF EXISTS purchases CASCADE;
DROP TABLE IF EXISTS prescriptions CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- 2. CREATE CUSTOMERS TABLE (Case-sensitive camelCase columns double-quoted for exact mapping)
CREATE TABLE customers (
    "id" TEXT PRIMARY KEY,
    "name" TEXT,
    "mobile" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "address" TEXT,
    "familyId" TEXT,
    "pointsCurrent" INTEGER DEFAULT 0,
    "pointsRedeemed" INTEGER DEFAULT 0,
    "createdAt" TEXT,
    "redeemedHistory" JSONB DEFAULT '[]'::jsonb,
    "whatsappReminders" JSONB DEFAULT '[]'::jsonb
);
-- Disable Row Level Security (RLS) to allow client-side anonymous reads/writes
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;

-- 3. CREATE PRESCRIPTIONS TABLE
CREATE TABLE prescriptions (
    "id" TEXT PRIMARY KEY,
    "customerId" TEXT,
    "rxDate" TEXT,
    "doctorName" TEXT,
    "rxImages" JSONB DEFAULT '[]'::jsonb,
    "pdfData" TEXT,
    "notes" TEXT,
    "createdAt" TEXT
);
ALTER TABLE prescriptions DISABLE ROW LEVEL SECURITY;

-- 4. CREATE PURCHASES TABLE
CREATE TABLE purchases (
    "id" TEXT PRIMARY KEY,
    "customerId" TEXT,
    "billNumber" TEXT,
    "billDate" TEXT,
    "billAmount" NUMERIC,
    "billPhoto" TEXT,
    "medicines" TEXT,
    "quantity" INTEGER,
    "pointsEarned" INTEGER,
    "createdAt" TEXT
);
ALTER TABLE purchases DISABLE ROW LEVEL SECURITY;

-- 5. CREATE REFILL_REMINDERS TABLE
CREATE TABLE refill_reminders (
    "id" TEXT PRIMARY KEY,
    "customerId" TEXT,
    "medicineName" TEXT,
    "quantity" INTEGER,
    "daysSupply" INTEGER,
    "expectedRefillDate" TEXT,
    "refillDate" TEXT,
    "status" TEXT,
    "createdAt" TEXT
);
ALTER TABLE refill_reminders DISABLE ROW LEVEL SECURITY;

-- 6. CREATE USERS TABLE
CREATE TABLE users (
    "id" TEXT PRIMARY KEY,
    "name" TEXT,
    "mobile" TEXT,
    "username" TEXT,
    "password" TEXT,
    "role" TEXT,
    "createdAt" TEXT,
    "lastLoginAt" TEXT,
    "loginCount" INTEGER DEFAULT 0,
    "status" TEXT
);
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 7. CREATE SETTINGS TABLE
CREATE TABLE settings (
    "id" TEXT PRIMARY KEY,
    "storeName" TEXT,
    "tagline" TEXT,
    "rupeesPerPoint" INTEGER DEFAULT 100,
    "storeAddress" TEXT,
    "storeMobile" TEXT,
    "storeWhatsApp" TEXT,
    "logo" TEXT,
    "banner" TEXT
);
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- 8. CREATE ACTIVITY_LOGS TABLE
CREATE TABLE activity_logs (
    "id" TEXT PRIMARY KEY,
    "name" TEXT,
    "role" TEXT,
    "action" TEXT,
    "timestamp" TEXT
);
ALTER TABLE activity_logs DISABLE ROW LEVEL SECURITY;

-- 9. POPULATE DEFAULT SYSTEM USERS FOR INITIAL LOGIN
INSERT INTO users ("id", "name", "mobile", "username", "password", "role", "createdAt", "lastLoginAt", "loginCount", "status")
VALUES 
('user-admin', 'System Admin', '9999999999', 'admin', 'admin123', 'Admin', '2026-06-04T12:00:00Z', '', 0, 'Active'),
('user-pharmacist', 'Default Pharmacist', '8888888888', 'pharmacist', 'pharma123', 'Pharmacist', '2026-06-04T12:00:00Z', '', 0, 'Active')
ON CONFLICT ("id") DO NOTHING;
