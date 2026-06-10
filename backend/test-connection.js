'use strict';

// Load .env dari root project (satu level di atas /backend)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('');
console.log('============================================================');
console.log('  WebWA Gateway — Supabase Connection Test');
console.log('============================================================');
console.log(`  URL  : ${SUPABASE_URL}`);
console.log(`  KEY  : ${SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20)}...`);
console.log('');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diset di .env!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function runTests() {
  let passed = 0;
  let failed = 0;

  // ──────────────────────────────────────────────
  // TEST 1: Cek koneksi dasar (ping via REST API)
  // ──────────────────────────────────────────────
  process.stdout.write('[1/5] Tes koneksi dasar (REST API)... ');
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    // PGRST116 (row not found) masih berarti koneksi OK
    if (error && !['PGRST116', '42P01'].includes(error.code)) {
      throw new Error(error.message);
    }
    console.log('✅ SUKSES');
    passed++;
  } catch (err) {
    console.log(`❌ GAGAL — ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // TEST 2: Cek tabel profiles ada
  // ──────────────────────────────────────────────
  process.stdout.write('[2/5] Cek tabel "profiles" ... ');
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error && error.code === '42P01') throw new Error('Tabel belum dibuat — jalankan schema_v2.sql!');
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    console.log('✅ ADA');
    passed++;
  } catch (err) {
    console.log(`❌ GAGAL — ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // TEST 3: Cek tabel sessions ada
  // ──────────────────────────────────────────────
  process.stdout.write('[3/5] Cek tabel "sessions" ... ');
  try {
    const { error } = await supabase.from('sessions').select('id').limit(1);
    if (error && error.code === '42P01') throw new Error('Tabel belum dibuat — jalankan schema_v2.sql!');
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    console.log('✅ ADA');
    passed++;
  } catch (err) {
    console.log(`❌ GAGAL — ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // TEST 4: Cek tabel ai_configs ada (tabel baru)
  // ──────────────────────────────────────────────
  process.stdout.write('[4/5] Cek tabel "ai_configs" ... ');
  try {
    const { error } = await supabase.from('ai_configs').select('id').limit(1);
    if (error && error.code === '42P01') throw new Error('Tabel belum dibuat — jalankan schema_v2.sql!');
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    console.log('✅ ADA');
    passed++;
  } catch (err) {
    console.log(`❌ GAGAL — ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // TEST 5: Cek tabel ai_chat_histories ada (tabel baru)
  // ──────────────────────────────────────────────
  process.stdout.write('[5/5] Cek tabel "ai_chat_histories" ... ');
  try {
    const { error } = await supabase.from('ai_chat_histories').select('id').limit(1);
    if (error && error.code === '42P01') throw new Error('Tabel belum dibuat — jalankan schema_v2.sql!');
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    console.log('✅ ADA');
    passed++;
  } catch (err) {
    console.log(`❌ GAGAL — ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────
  // RINGKASAN
  // ──────────────────────────────────────────────
  console.log('');
  console.log('============================================================');
  console.log(`  Hasil: ${passed} lulus / ${failed} gagal`);

  if (failed === 0) {
    console.log('  🎉 Semua tes lulus! Supabase terhubung & schema siap.');
  } else if (passed >= 1) {
    console.log('  ⚠️  Koneksi OK, tapi beberapa tabel belum ada.');
    console.log('  ➜  Jalankan schema_v2.sql di Supabase SQL Editor.');
  } else {
    console.log('  ❌ Tidak bisa terhubung ke Supabase.');
    console.log('  ➜  Periksa SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY di .env');
  }

  console.log('============================================================');
  console.log('');
}

runTests().catch((err) => {
  console.error('Error tidak terduga:', err.message);
  process.exit(1);
});
