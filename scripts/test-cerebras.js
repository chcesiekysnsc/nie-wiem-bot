#!/usr/bin/env node
// Test integracji Cerebras dla !analiza
// Uruchom lokalnie (nie w sandboxie E2B, bo tam egress jest blokowany poza api.github.com):
//   npm install --ignore-scripts axios dotenv  # jeśli nie masz node_modules
//   node scripts/test-cerebras.js
// Skrypt czyta CEREBRAS_API_KEY i CEREBRAS_MODEL z .env

require('dotenv').config();
const axios = require('axios');

const key = process.env.CEREBRAS_API_KEY || 'csk-xxx_REPLACE_WITH_YOUR_KEY';
const modelRaw = process.env.CEREBRAS_MODEL || 'qwen-3-32b';

function normalizeCerebrasModel(raw) {
  const m = String(raw || '').trim();
  if (!m) return 'qwen-3-32b';
  if (m === 'qwen-3.8-27b' || m === 'qwen/qwen3.8-27b' || m === 'qwen/qwen3-32b') return 'qwen-3-32b';
  if (m.includes('/')) return m.split('/').pop().replace('qwen3-', 'qwen-3-').replace('qwen3', 'qwen-3');
  return m;
}
const model = normalizeCerebrasModel(modelRaw);

console.log('========================================');
console.log(' TEST CEREBRAS API - !analiza');
console.log('========================================');
console.log(`Klucz: ${key.slice(0, 8)}...${key.slice(-4)} (len=${key.length})`);
console.log(`Model surowy z .env: "${modelRaw}" -> znormalizowany: "${model}"`);
console.log(`Endpoint: https://api.cerebras.ai/v1/chat/completions`);
console.log('');

async function testModels() {
  // Lista modeli do przetestowania (Cerebras oficjalnie wspiera):
  // qwen-3-32b, qwen-3-235b-a22b-instruct-2507, llama-3.3-70b, llama3.1-8b, gpt-oss-120b
  const modelsToTest = [
    model, // ten z .env (priorytet)
    'qwen-3-32b',
    'qwen-3-235b-a22b-instruct-2507',
    'llama-3.3-70b',
    'llama3.1-8b',
  ];
  // usuń duplikaty
  const uniq = [...new Set(modelsToTest)];
  console.log(`Modele do testu: ${uniq.join(', ')}`);
  console.log('');

  // Najpierw lista modeli (jeśli endpoint działa)
  try {
    console.log('--- GET /v1/models ---');
    const res = await axios.get('https://api.cerebras.ai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      timeout: 15000
    });
    console.log(`✅ Lista modeli OK (${res.data.data?.length || '?' } modeli)`);
    console.log(JSON.stringify(res.data, null, 2).slice(0, 1500));
  } catch (err) {
    console.log(`⚠️  /v1/models failed: ${err.response?.status || err.code} ${err.response?.data?.error?.message || err.message}`);
    if (err.code === 'ENETUNREACH' || err.message.includes('socket') || err.message.includes('SSL')) {
      console.log('   -> To wygląda jak blokada egress (sandbox E2B blokuje wszystko poza api.github.com).');
      console.log('   -> Uruchom ten skrypt LOKALNIE na swoim PC, a nie w sandboxie!');
    }
  }

  console.log('');
  for (const m of uniq) {
    console.log(`--- TEST model: ${m} ---`);
    try {
      const res = await axios.post(
        'https://api.cerebras.ai/v1/chat/completions',
        {
          model: m,
          messages: [{ role: 'user', content: 'Cześć! Odpowiedz jednym zdaniem po polsku: jaka jest stolica Francji?' }],
          max_tokens: 200,
          temperature: 0.7,
          stream: false
        },
        {
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );
      console.log(`✅ SUKCES model ${m} (status ${res.status})`);
      console.log(`   Odpowiedź: ${res.data.choices[0]?.message?.content?.slice(0, 300)}`);
      console.log(`   Usage:`, res.data.usage);
      // Test zaliczony, nie testuj dalej jeśli główny model działa
      if (m === model) {
        console.log('\n🎉 Główny model działa! !analiza będzie używać tego modelu.');
        return true;
      }
    } catch (err) {
      const status = err.response?.status;
      const rawData = err.response?.data ? JSON.stringify(err.response.data, null, 2) : '';
      const data = rawData || err.message || 'brak danych';
      console.log(`❌ FAIL model ${m} status=${status || 'BLOKADA SIECI'}`);
      console.log(`   ${String(data).slice(0, 800)}`);
      if (status === 404 || (rawData && rawData.includes('model'))) {
        console.log('   -> Model nie istnieje na Cerebras, sprawdź docs https://inference-docs.cerebras.ai/');
      }
      if (status === 401 || status === 403) {
        console.log('   -> Błąd autoryzacji: sprawdź czy klucz jest poprawny (powinien zaczynać się od csk-)');
      }
      if (!status && (err.message.includes('SSL') || err.message.includes('socket') || err.code === 'ECONNRESET')) {
        console.log('   -> Blokada sieciowa sandboxu E2B - to normalne tutaj. Uruchom lokalnie!');
        console.log('   -> Dowód: curl do api.cerebras.ai daje SSL_ERROR_SYSCALL, a do api.github.com działa (E2B Proxy CA).');
        break;
      }
    }
    await new Promise(r => setTimeout(r, 700));
  }
  console.log('\n=== KONIEC TESTÓW ===');
  console.log('Jeśli widzisz "Blokada sieciowa" to normalne w sandboxie E2B.');
  console.log('Sandbox przepuszcza tylko api.github.com (E2B Proxy CA), reszta dostaje SSL_ERROR_SYSCALL.');
  console.log('Przetestuj lokalnie: node scripts/test-cerebras.js');
}

testModels().then(() => {
  console.log('\n--- Sprawdzenie .env ---');
  console.log(`CEREBRAS_API_KEY w .env: ${process.env.CEREBRAS_API_KEY ? 'TAK ✅' : 'BRAK ❌'}`);
  console.log(`CEREBRAS_MODEL w .env: ${process.env.CEREBRAS_MODEL || '(brak, użyje qwen-3-32b)'}`);
  console.log(`GROQ_API_KEY w .env: ${process.env.GROQ_API_KEY ? 'TAK (fallback)' : 'BRAK (tylko Cerebras)'}`);
});
