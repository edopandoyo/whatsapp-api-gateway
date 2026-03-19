/**
 * Test Koneksi Supabase - Simple Health Check
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('═'.repeat(50));
console.log('🔍 SUPABASE CONNECTION TEST');
console.log('═'.repeat(50));
console.log('URL:', SUPABASE_URL);
console.log('Key:', SUPABASE_ANON_KEY ? '✓ Present' : '✗ Missing');
console.log('═'.repeat(50));

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Error: Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function healthCheck() {
  try {
    // Test health endpoint
    console.log('\n📡 Checking health endpoint...');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`);
    
    console.log('   Status:', response.status, response.statusText);
    console.log('   Headers:', {
      'Content-Type': response.headers.get('content-type'),
      'X-Powered-By': response.headers.get('x-powered-by'),
    });

    if (response.status === 401 || response.status === 403) {
      console.log('\n⚠️  Authentication required!');
      console.log('   You need to provide a valid API key for this Supabase instance.');
      console.log('\n💡 To get your API key:');
      console.log('   1. Login to your Supabase dashboard');
      console.log('   2. Go to Project Settings → API');
      console.log('   3. Copy the "anon public" or "service_role" key');
      console.log('   4. Update backend/.env with the correct key');
    } else if (response.ok) {
      console.log('\n✅ Supabase is reachable and responding!');
    }

    // Test authentication with provided key
    console.log('\n🔐 Testing authentication...');
    const { data, error } = await supabase
      .from('pg_catalog.pg_tables')
      .select('tablename')
      .eq('schemaname', 'public')
      .limit(1);

    if (error) {
      console.log('   ❌ Query failed:', error.message);
      if (error.message.includes('JWT') || error.message.includes('Unauthorized')) {
        console.log('   → Invalid or expired API key');
      }
    } else {
      console.log('   ✓ Authentication successful!');
      console.log('   ✓ Can access database tables');
    }

    console.log('\n' + '═'.repeat(50));
    console.log('Test completed!');
    console.log('═'.repeat(50));

  } catch (err: any) {
    console.error('\n❌ Connection failed!');
    console.error('Error:', err.message);
    if (err.cause) {
      console.error('Cause:', err.cause);
    }
    process.exit(1);
  }
}

healthCheck();
