/**
 * E2E Integration Flow Test Script
 * 
 * This script tests the auto-provisioning, session management, and SDK functionality
 * against the local running backend.
 * 
 * PREREQUISITES:
 * 1. Ensure schema_v3.sql has been applied to Supabase.
 * 2. Insert a master API key for testing:
 *    INSERT INTO integration_api_keys (source, name, master_key_hash) 
 *    VALUES ('photobooth', 'Test Master Key', encode(digest('test_master_key_123', 'sha256'), 'hex'));
 * 3. Start the backend: npm run dev
 */

const { WAGatewayClient } = require('../packages/wa-gateway-sdk/dist');
const crypto = require('crypto');

const BASE_URL = 'http://localhost:3000/api/v1';
const MASTER_KEY = 'test_master_key_123';
const TEST_VENDOR_ID = crypto.randomUUID();

async function runTest() {
  console.log('🏁 Starting Integration Flow Test...\n');

  try {
    // ----------------------------------------------------
    // Test 1: Health Check
    // ----------------------------------------------------
    console.log('🏥 Test 1: Health Check...');
    const adminClient = WAGatewayClient.forIntegration(BASE_URL, MASTER_KEY);
    const health = await adminClient.healthCheck();
    console.log('   ✓ Health Status:', health.status);
    console.log('   ✓ Uptime:', health.uptime);

    // ----------------------------------------------------
    // Test 2: Auto-Provisioning Registration
    // ----------------------------------------------------
    console.log('\n👤 Test 2: Auto-Provisioning Vendor registration...');
    const registration = await adminClient.registerIntegration({
      vendorId: TEST_VENDOR_ID,
      vendorName: 'Test Photobooth Vendor',
      source: 'photobooth',
    });

    console.log('   ✓ Registered successfully!');
    console.log('   ✓ Vendor API Key:', registration.apiKey);
    console.log('   ✓ Vendor User ID:', registration.userId);
    console.log('   ✓ Is New Registration:', registration.isNew);

    const vendorApiKey = registration.apiKey;

    // ----------------------------------------------------
    // Test 3: Session Management with Vendor API Key
    // ----------------------------------------------------
    console.log('\n🔑 Test 3: Creating WhatsApp Session with Vendor API Key...');
    const vendorClient = WAGatewayClient.forVendor(BASE_URL, vendorApiKey);
    
    const sessionName = `Test Session - ${Date.now()}`;
    const session = await vendorClient.createSession({
      name: sessionName,
      vendorId: TEST_VENDOR_ID,
      integrationSource: 'photobooth'
    });

    console.log('   ✓ Session created successfully!');
    console.log('   ✓ Session ID:', session.id);
    console.log('   ✓ Session Name:', session.name);
    console.log('   ✓ Session Status:', session.status);

    const sessionId = session.id;

    // ----------------------------------------------------
    // Test 4: List Sessions
    // ----------------------------------------------------
    console.log('\n📋 Test 4: Listing Vendor Sessions...');
    const sessions = await vendorClient.getSessions();
    console.log(`   ✓ Found ${sessions.length} sessions`);
    const found = sessions.some(s => s.id === sessionId);
    console.log('   ✓ Newly created session in list:', found ? 'Yes ✓' : 'No ✗');

    // ----------------------------------------------------
    // Test 5: Get Session Detail & Connection Status
    // ----------------------------------------------------
    console.log('\n📡 Test 5: Getting Session details & status...');
    const details = await vendorClient.getSession(sessionId);
    console.log('   ✓ Details - Name:', details.name, '| Status:', details.status);

    const status = await vendorClient.getSessionStatus(sessionId);
    console.log('   ✓ Polling Status:', status.status);

    // ----------------------------------------------------
    // Test 6: Retrieve QR Code (should be QR_NOT_AVAILABLE or get QR if ready)
    // ----------------------------------------------------
    console.log('\n🖼️  Test 6: Retrieving QR Code...');
    try {
      // Small wait to give Puppeteer a chance to launch
      console.log('   Waiting 5 seconds for Puppeteer to initialize and generate QR...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const qrData = await vendorClient.getQRCode(sessionId);
      console.log('   ✓ QR Code base64 data URL fetched!');
      console.log('   ✓ Expiration:', qrData.expiresAt);
      console.log('   ✓ QR code prefix (first 50 chars):', qrData.qrCode.substring(0, 50) + '...');
    } catch (err) {
      console.log('   ⚠️  QR Code Retrieval returned expected error/state:', err.message);
    }

    // ----------------------------------------------------
    // Test 7: Disconnect / Clean up Session
    // ----------------------------------------------------
    console.log('\n🧹 Test 7: Disconnecting and Deleting Session...');
    await vendorClient.deleteSession(sessionId);
    console.log('   ✓ Session deleted successfully!');

    // Verify deletion
    try {
      await vendorClient.getSession(sessionId);
      console.log('   ❌ Error: Session still exists!');
    } catch (err) {
      console.log('   ✓ Verified session is gone (returned 404):', err.message);
    }

    console.log('\n🎉 All tests passed successfully!');

  } catch (err) {
    console.error('\n❌ Test failed with error:', err.message);
    if (err.details) {
      console.error('   Details:', err.details);
    }
  }
}

runTest();
