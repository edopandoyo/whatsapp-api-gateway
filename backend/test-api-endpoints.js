/**
 * Test Backend API Endpoints
 * Script untuk test semua endpoint backend
 */

const axios = require('axios');
require('dotenv').config();

const API_BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = `http://localhost:${process.env.PORT || 3000}`;

console.log('══════════════════════════════════════════════════');
console.log('🔍 BACKEND API ENDPOINT TEST');
console.log('══════════════════════════════════════════════════');
console.log('Backend URL:', BACKEND_URL);
console.log('══════════════════════════════════════════════════\n');

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10000,
});

async function testEndpoint(method, url, description, options = {}) {
  const fullUrl = `${BACKEND_URL}${url}`;
  try {
    console.log(`📡 Testing ${method} ${url}`);
    console.log(`   ${description}`);
    
    const response = await api({ method, url, ...options });
    console.log(`   ✅ Status: ${response.status} ${response.statusText}`);
    if (response.data) {
      console.log(`   📦 Response:`, JSON.stringify(response.data).slice(0, 200));
    }
    console.log('');
    return response;
  } catch (error) {
    console.log(`   ❌ Status: ${error.response?.status || 'N/A'} ${error.response?.statusText || error.message}`);
    if (error.response?.data) {
      console.log(`   📦 Response:`, JSON.stringify(error.response.data).slice(0, 200));
    }
    console.log('');
    return error;
  }
}

async function runTests() {
  // Test 1: Health Check
  console.log('━━━ Test 1: Health Check (Public) ━━━\n');
  await testEndpoint('GET', '/health', 'Public health check endpoint');

  // Test 2: Internal Sessions (requires JWT)
  console.log('━━━ Test 2: Internal API (Requires JWT) ━━━\n');
  await testEndpoint('GET', '/api/internal/sessions', 'Get sessions list', {
    headers: { Authorization: 'Bearer INVALID_TOKEN' }
  });

  // Test 3: External Messages (requires API Key)
  console.log('━━━ Test 3: External API (Requires API Key) ━━━\n');
  await testEndpoint('GET', '/api/v1/sessions', 'Get sessions with API key', {
    headers: { 'x-api-key': 'invalid_key' }
  });

  // Test 4: 404 Test
  console.log('━━━ Test 4: 404 Test ━━━\n');
  await testEndpoint('GET', '/api/nonexistent', 'Non-existent endpoint');

  console.log('══════════════════════════════════════════════════');
  console.log('✅ All tests completed!');
  console.log('══════════════════════════════════════════════════');
}

runTests().catch(console.error);
