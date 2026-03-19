/**
 * Script untuk disable email confirmation di Supabase
 * Jalankan ini sekali untuk mengkonfigurasi Supabase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Gunakan service_role key untuk admin access
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function disableEmailConfirmation() {
  console.log('🔧 Mengkonfigurasi Supabase Auth...\n');

  // Note: Untuk self-hosted Supabase, konfigurasi Auth biasanya dilakukan
  // via environment variables atau dashboard admin
  
  console.log('📝 Untuk disable email confirmation di self-hosted Supabase:');
  console.log('');
  console.log('1. Via Dashboard Admin:');
  console.log('   - Login ke http://157.15.40.90:8000');
  console.log('   - Buka Project Settings → Authentication');
  console.log('   - Set "Enable email confirmations" = OFF');
  console.log('   - Atau set "Mailer autoconfirm" = ON');
  console.log('');
  console.log('2. Via Environment Variables (Docker):');
  console.log('   GOTRUE_MAILER_AUTOCONFIRM=true');
  console.log('   GOTRUE_SMTP_ADMIN_EMAIL=admin@example.com');
  console.log('');
  console.log('3. Test signup ulang setelah konfigurasi');
  console.log('');
  
  // Test jika kita bisa access
  try {
    const { data, error } = await supabase
      .from('pg_catalog.pg_tables')
      .select('tablename')
      .limit(1);
    
    if (error) {
      console.log('⚠️  Tidak dapat access database dengan API key ini');
      console.log('   Error:', error.message);
    } else {
      console.log('✅ Database connection OK');
    }
  } catch (err: any) {
    console.log('❌ Connection error:', err.message);
  }
}

disableEmailConfirmation();
