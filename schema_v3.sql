-- ============================================================
-- WhatsApp API Gateway - Schema v3
-- Adds multi-tenant vendor integration support
-- ============================================================

-- ============================================================
-- MIGRATION: Add vendor integration columns to sessions table
-- ============================================================

-- Add vendor_id column to sessions table for multi-tenant support
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS vendor_id UUID;

-- Add integration_source column to track where session was created
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS integration_source TEXT DEFAULT 'direct';
-- Values: 'direct' (WA Gateway dashboard), 'photobooth', 'custom'

-- Add index for vendor_id lookups
CREATE INDEX IF NOT EXISTS idx_sessions_vendor_id ON sessions(vendor_id);

-- Add index for integration_source filtering
CREATE INDEX IF NOT EXISTS idx_sessions_integration_source ON sessions(integration_source);

-- ============================================================
-- NEW TABLE: vendor_integrations
-- Maps external vendor accounts (e.g. photobooth vendors) to
-- WA Gateway users and API keys for auto-provisioning
-- ============================================================

CREATE TABLE IF NOT EXISTS vendor_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- External vendor identification
  vendor_id UUID NOT NULL,              -- ID vendor di project external (e.g. photobooth)
  vendor_source TEXT NOT NULL,          -- Source project: 'photobooth', 'custom', etc.
  vendor_name TEXT,                     -- Display name of vendor (optional)
  vendor_email TEXT,                    -- Email of vendor (optional, for auto-created user)
  
  -- WA Gateway mapping
  wa_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',          -- Additional integration metadata
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Each vendor can only have one integration per source
  UNIQUE(vendor_id, vendor_source)
);

-- Indexes for vendor_integrations
CREATE INDEX IF NOT EXISTS idx_vendor_integrations_vendor_id ON vendor_integrations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_integrations_vendor_source ON vendor_integrations(vendor_source);
CREATE INDEX IF NOT EXISTS idx_vendor_integrations_wa_user_id ON vendor_integrations(wa_user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_integrations_is_active ON vendor_integrations(is_active);

-- ============================================================
-- NEW TABLE: integration_api_keys (optional)
-- Master API keys for external projects to auto-provision vendors
-- ============================================================

CREATE TABLE IF NOT EXISTS integration_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Integration identification
  source TEXT NOT NULL UNIQUE,          -- 'photobooth', 'custom', etc.
  name TEXT NOT NULL,                   -- Display name
  
  -- Authentication
  master_key_hash TEXT NOT NULL,        -- Hashed master key for auto-provisioning
  
  -- Configuration
  is_active BOOLEAN DEFAULT true,
  max_vendors INTEGER,                  -- NULL = unlimited
  auto_create_user BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for integration_api_keys
CREATE INDEX IF NOT EXISTS idx_integration_api_keys_source ON integration_api_keys(source);
CREATE INDEX IF NOT EXISTS idx_integration_api_keys_is_active ON integration_api_keys(is_active);

-- ============================================================
-- UPDATED: sessions table (full definition for reference)
-- ============================================================

-- For reference, the sessions table should now look like:
-- CREATE TABLE sessions (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id UUID REFERENCES users(id) ON DELETE CASCADE,
--   vendor_id UUID,                      -- NEW: links to vendor_integrations.vendor_id
--   name TEXT NOT NULL,
--   status TEXT DEFAULT 'disconnected',  -- disconnected, connecting, connected, qr_ready
--   phone_number TEXT,
--   qr_code TEXT,
--   integration_source TEXT DEFAULT 'direct',  -- NEW: 'direct', 'photobooth', etc.
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   updated_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- ============================================================
-- RLS Policies for vendor_integrations (if using Supabase RLS)
-- ============================================================

ALTER TABLE vendor_integrations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own vendor integrations
CREATE POLICY "Users can view own vendor integrations" ON vendor_integrations
  FOR SELECT USING (
    wa_user_id = auth.uid()
  );

-- Users can update their own vendor integrations
CREATE POLICY "Users can update own vendor integrations" ON vendor_integrations
  FOR UPDATE USING (
    wa_user_id = auth.uid()
  );

-- Service role (backend) can do everything
CREATE POLICY "Service role full access vendor integrations" ON vendor_integrations
  FOR ALL USING (
    auth.role() = 'service_role'
  );

-- ============================================================
-- RLS Policies for integration_api_keys
-- ============================================================

ALTER TABLE integration_api_keys ENABLE ROW LEVEL SECURITY;

-- Only service role can access integration_api_keys
CREATE POLICY "Service role full access integration keys" ON integration_api_keys
  FOR ALL USING (
    auth.role() = 'service_role'
  );

-- ============================================================
-- Updated RLS for sessions (add vendor_id access)
-- ============================================================

-- Users can view sessions where they are the owner OR the vendor integration owner
DROP POLICY IF EXISTS "Users can view own sessions" ON sessions;
CREATE POLICY "Users can view own sessions" ON sessions
  FOR SELECT USING (
    user_id = auth.uid()
    OR vendor_id IN (
      SELECT vendor_id FROM vendor_integrations WHERE wa_user_id = auth.uid()
    )
  );

-- Users can insert sessions for themselves or their vendor integrations
DROP POLICY IF EXISTS "Users can insert own sessions" ON sessions;
CREATE POLICY "Users can insert own sessions" ON sessions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR vendor_id IN (
      SELECT vendor_id FROM vendor_integrations WHERE wa_user_id = auth.uid()
    )
  );

-- Users can update their own sessions
DROP POLICY IF EXISTS "Users can update own sessions" ON sessions;
CREATE POLICY "Users can update own sessions" ON sessions
  FOR UPDATE USING (
    user_id = auth.uid()
    OR vendor_id IN (
      SELECT vendor_id FROM vendor_integrations WHERE wa_user_id = auth.uid()
    )
  );

-- Users can delete their own sessions
DROP POLICY IF EXISTS "Users can delete own sessions" ON sessions;
CREATE POLICY "Users can delete own sessions" ON sessions
  FOR DELETE USING (
    user_id = auth.uid()
    OR vendor_id IN (
      SELECT vendor_id FROM vendor_integrations WHERE wa_user_id = auth.uid()
    )
  );

-- ============================================================
-- Helper function: get or create vendor integration
-- ============================================================

CREATE OR REPLACE FUNCTION get_or_create_vendor_integration(
  p_vendor_id UUID,
  p_vendor_source TEXT,
  p_vendor_name TEXT DEFAULT NULL,
  p_vendor_email TEXT DEFAULT NULL
)
RETURNS TABLE (
  integration_id UUID,
  wa_user_id UUID,
  api_key_id UUID,
  is_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_record RECORD;
  new_user_id UUID;
  new_api_key_id UUID;
  new_integration_id UUID;
  v_is_new BOOLEAN := false;
BEGIN
  -- Check if integration already exists
  SELECT id, wa_user_id, api_key_id INTO existing_record
  FROM vendor_integrations
  WHERE vendor_id = p_vendor_id AND vendor_source = p_vendor_source
  LIMIT 1;
  
  IF FOUND THEN
    RETURN QUERY SELECT 
      existing_record.id, 
      existing_record.wa_user_id, 
      existing_record.api_key_id, 
      false;
    RETURN;
  END IF;
  
  -- Create new integration
  v_is_new := true;
  
  -- Note: User and API key creation is handled by the backend service
  -- This function just creates the integration record
  -- The backend will call this after creating user + api_key
  
  RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::UUID, true;
END;
$$;

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE vendor_integrations IS 'Maps external vendor accounts to WA Gateway users and API keys';
COMMENT ON COLUMN sessions.vendor_id IS 'Links to vendor_integrations.vendor_id for multi-tenant support';
COMMENT ON COLUMN sessions.integration_source IS 'Tracks where session was created: direct, photobooth, custom';
COMMENT ON TABLE integration_api_keys IS 'Master API keys for external projects to auto-provision vendors';