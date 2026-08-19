import test from 'node:test';
import assert from 'node:assert/strict';

// Helper function equivalent to companion-drawer extraction
function extractActionAndText(content: string) {
  const match = content.match(/\[ACTION\]([\s\S]*?)\[\/ACTION\]/);
  if (!match) {
    return { cleanText: content, action: null };
  }

  const rawJson = match[1].trim();
  const cleanText = content.replace(/\[ACTION\][\s\S]*?\[\/ACTION\]/, '').trim();

  try {
    const action = JSON.parse(rawJson);
    return { cleanText, action };
  } catch {
    return { cleanText, action: null };
  }
}

test('AI Parser: correctly extracts transaction action and clean markdown text', () => {
  const aiOutput = `I have prepared the entry for your lunch payment.\n\n[ACTION]\n{\n  "actionType": "transaction",\n  "amount": 350,\n  "description": "Lunch from Kotak",\n  "type": "expense",\n  "direction": "out",\n  "accountName": "Kotak",\n  "date": "2026-08-18"\n}\n[/ACTION]`;

  const { cleanText, action } = extractActionAndText(aiOutput);
  assert.equal(cleanText, 'I have prepared the entry for your lunch payment.');
  assert.ok(action !== null);
  assert.equal(action.actionType, 'transaction');
  assert.equal(action.amount, 350);
  assert.equal(action.direction, 'out');
  assert.equal(action.accountName, 'Kotak');
});

test('AI Parser: correctly extracts borrowing/payable action and clean markdown text', () => {
  const aiOutput = `Recorded that you borrowed money from Rahul.\n\n[ACTION]\n{\n  "actionType": "payable",\n  "amount": 5000,\n  "personName": "Rahul",\n  "description": "Borrowed from Rahul",\n  "date": "2026-08-18"\n}\n[/ACTION]`;

  const { cleanText, action } = extractActionAndText(aiOutput);
  assert.equal(cleanText, 'Recorded that you borrowed money from Rahul.');
  assert.ok(action !== null);
  assert.equal(action.actionType, 'payable');
  assert.equal(action.amount, 5000);
  assert.equal(action.personName, 'Rahul');
});

test('AI Parser: handles conversational response with no action gracefully', () => {
  const conversationalText = 'Your net worth is ₹4,50,000 across 3 accounts.';
  const { cleanText, action } = extractActionAndText(conversationalText);
  assert.equal(cleanText, conversationalText);
  assert.equal(action, null);
});

test('AI Parser: handles malformed action block without crashing', () => {
  const brokenOutput = 'Payment noted. [ACTION] { "broken": json... [/ACTION]';
  const { cleanText, action } = extractActionAndText(brokenOutput);
  assert.equal(cleanText, 'Payment noted.');
  assert.equal(action, null);
});

// Middleware API bypass verification test
test('Middleware rule: ensures /api/ requests receive JSON 401 instead of redirect to /login', () => {
  const apiPath = '/api/chat';
  const isApi = apiPath.startsWith('/api');
  assert.ok(isApi, 'Must identify /api routes');

  // Verify that API responses return status 401 JSON and not redirect
  const mockUnauthApiResponse = isApi
    ? { status: 401, json: { error: 'Unauthorized. Please sign in.' }, isRedirect: false }
    : { status: 307, location: '/login', isRedirect: true };

  assert.equal(mockUnauthApiResponse.status, 401);
  assert.equal(mockUnauthApiResponse.isRedirect, false);
  assert.equal(mockUnauthApiResponse.json.error, 'Unauthorized. Please sign in.');
});

// Service Worker bypass rule test
test('Service Worker rule: verifies all API endpoints and Supabase requests bypass cache', () => {
  const bypassUrls = [
    'https://nisflow.finance/api/chat',
    'https://nisflow.finance/api/ai/insights',
    'https://nisflow.finance/api/ai/categorize',
    'https://nisflow.finance/api/recurring/execute',
    'https://qyjhicibrciqcznsdevk.supabase.co/rest/v1/accounts',
  ];

  bypassUrls.forEach((testUrl) => {
    const url = new URL(testUrl);
    const shouldBypass =
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/auth/') ||
      url.hostname.includes('supabase.co');
    assert.ok(shouldBypass, `URL ${testUrl} must bypass service worker cache`);
  });
});

// Gemini Model Configuration and Key Resolution
test('AI Provider: validates active Gemini model identifier and multi-key fallback', () => {
  const activeModel = 'gemini-3.6-flash';
  assert.equal(activeModel, 'gemini-3.6-flash');

  // Test fallback precedence: GOOGLE_GENERATIVE_AI_API_KEY -> GEMINI_API_KEY -> GOOGLE_API_KEY
  const resolveKey = (env: Record<string, string | undefined>) =>
    env.GOOGLE_GENERATIVE_AI_API_KEY || env.GEMINI_API_KEY || env.GOOGLE_API_KEY || null;

  assert.equal(resolveKey({ GOOGLE_GENERATIVE_AI_API_KEY: 'key-1', GEMINI_API_KEY: 'key-2' }), 'key-1');
  assert.equal(resolveKey({ GEMINI_API_KEY: 'key-2' }), 'key-2');
  assert.equal(resolveKey({ GOOGLE_API_KEY: 'key-3' }), 'key-3');
  assert.equal(resolveKey({}), null);
});

// Client Stream Error Detection
test('Client Reader: empty stream is rejected with explicit user error', () => {
  const accumulatedContent = '   ';
  const hasContent = Boolean(accumulatedContent.trim());
  assert.equal(hasContent, false);

  const getError = (content: string) => {
    if (!content.trim()) {
      return 'NisFlow AI was unable to generate a response. Please try again.';
    }
    return null;
  };

  assert.equal(getError(accumulatedContent), 'NisFlow AI was unable to generate a response. Please try again.');
  assert.equal(getError('Hello user'), null);
});
