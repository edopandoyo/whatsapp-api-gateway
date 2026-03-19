/**
 * Test Koneksi Supabase
 * Script ini akan mencoba terhubung ke instance Supabase Anda
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Testing Supabase Connection...\n');
console.log('📍 URL:', SUPABASE_URL);
console.log('🔑 Key:', SUPABASE_SERVICE_ROLE_KEY ? 'Present ✓' : 'Missing ✗');
console.log('');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testConnection() {
  try {
    console.log('🔄 Mencoba terhubung ke Supabase...\n');

    // Test 1: Simple query
    console.log('📋 Test 1: Simple query (SELECT 1)');
    const { data: simpleData, error: simpleError } = await supabase
      .from('_ping')
      .select('*')
      .limit(1);

    if (simpleError) {
      console.log('   ⚠️  Table _ping tidak ada (normal)');
    } else {
      console.log('   ✓ Response:', simpleData);
    }

    // Test 2: Check if we can access system tables
    console.log('\n📋 Test 2: Check database version');
    const { data: versionData, error: versionError } = await supabase
      .rpc('version');

    if (versionError) {
      console.log('   ⚠️  Cannot access version:', versionError.message);
    } else {
      console.log('   ✓ PostgreSQL Version:', versionData);
    }

    // Test 3: Try to list tables (if we have permission)
    console.log('\n📋 Test 3: List tables in public schema');
    const { data: tablesData, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');

    if (tablesError) {
      console.log('   ⚠️  Cannot list tables:', tablesError.message);
    } else {
      console.log('   ✓ Tables found:', tablesData?.length || 0);
      if (tablesData && tablesData.length > 0) {
        console.log('   📦 Table names:', tablesData.map(t => t.table_name).join(', '));
      }
    }

    // Test 4: Check existing Supabase tables
    console.log('\n📋 Test 4: Check WebWA Gateway tables');
    const expectedTables = ['users', 'sessions', 'api_keys', 'message_logs', 'webhook_deliveries'];
    
    for (const table of expectedTables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`   ❌ Table '${table}': Not found or no access`);
      } else {
        console.log(`   ✓ Table '${table}': Exists (${count} rows)`);
      }
    }

    console.log('\n✅ Supabase connection test completed!\n');

  } catch (err: any) {
    console.error('\n❌ Connection failed!');
    console.error('Error:', err.message);
    console.error('Details:', err);
    process.exit(1);
  }
}

testConnection();
