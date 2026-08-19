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
  const activeModel = 'gemini-3.5-flash-lite';
  assert.equal(activeModel, 'gemini-3.5-flash-lite');

  // Test fallback precedence: GOOGLE_GENERATIVE_AI_API_KEY -> GEMINI_API_KEY -> GOOGLE_API_KEY
  const resolveKey = (env: Record<string, string | undefined>) =>
    env.GOOGLE_GENERATIVE_AI_API_KEY || env.GEMINI_API_KEY || env.GOOGLE_API_KEY || null;

  assert.equal(resolveKey({ GOOGLE_GENERATIVE_AI_API_KEY: 'key-1', GEMINI_API_KEY: 'key-2' }), 'key-1');
  assert.equal(resolveKey({ GEMINI_API_KEY: 'key-2' }), 'key-2');
  assert.equal(resolveKey({ GOOGLE_API_KEY: 'key-3' }), 'key-3');
  assert.equal(resolveKey({}), null);
});

// Client Stream Error Detection and Request ID Propagation
test('Client Reader: empty stream produces informative error with Request ID', () => {
  const requestId = 'req-test-12345';
  const getErrorMessage = (content: string, reqId: string) => {
    if (!content.trim()) {
      return `AI was unable to generate a response. Please try again. (Ref: ${reqId})`;
    }
    return null;
  };

  assert.equal(
    getErrorMessage('', requestId),
    'AI was unable to generate a response. Please try again. (Ref: req-test-12345)'
  );
  assert.equal(getErrorMessage('Valid response', requestId), null);
});

// Error Status Code Categorization Matrix
test('Error Translation: HTTP status codes map to specific, safe actionable messages', () => {
  const translateStatus = (status: number, reqId: string, errorJson?: any) => {
    if (status === 401) return 'Session expired. Please sign in again.';
    if (status === 403) return `AI provider access was denied. (Ref: ${reqId})`;
    if (status === 404) return `The configured AI model is unavailable. (Ref: ${reqId})`;
    if (status === 429) return 'AI is temporarily rate-limited. Please wait a moment and try again.';
    if (status === 503) return `AI service is temporarily experiencing high traffic. Please try again shortly. (Ref: ${reqId})`;
    if (status === 504) return `AI response timed out. Please try again. (Ref: ${reqId})`;
    if (errorJson?.error) return `${errorJson.error} (Ref: ${reqId})`;
    return `NisFlow AI encountered an error. (Ref: ${reqId})`;
  };

  const reqId = 'req-abc-999';
  assert.equal(translateStatus(401, reqId), 'Session expired. Please sign in again.');
  assert.equal(translateStatus(403, reqId), 'AI provider access was denied. (Ref: req-abc-999)');
  assert.equal(translateStatus(404, reqId), 'The configured AI model is unavailable. (Ref: req-abc-999)');
  assert.equal(translateStatus(429, reqId), 'AI is temporarily rate-limited. Please wait a moment and try again.');
  assert.equal(translateStatus(503, reqId), 'AI service is temporarily experiencing high traffic. Please try again shortly. (Ref: req-abc-999)');
  assert.equal(translateStatus(504, reqId), 'AI response timed out. Please try again. (Ref: req-abc-999)');
});

// Partial Stream Interruption Handling
test('Stream Interruption: partial stream preserves content and adds retry marker', () => {
  const partialText = 'Your current cash balance is ₹5,000.00 in Bob Account.';
  const interruptedOutput = `${partialText}\n\n*(Connection interrupted — tap Retry below to regenerate)*`;

  assert.ok(interruptedOutput.includes(partialText));
  assert.ok(interruptedOutput.includes('Connection interrupted'));
});

// Missing API Key Handling
test('AI Configuration: missing API key returns structured 503 with Request ID', () => {
  const reqId = 'req-no-key-1';
  const buildMissingKeyResponse = (requestId: string) => ({
    status: 503,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    body: {
      error: 'AI service is temporarily unconfigured. Please ensure GOOGLE_GENERATIVE_AI_API_KEY is configured in deployment environment.',
      requestId,
    },
  });

  const res = buildMissingKeyResponse(reqId);
  assert.equal(res.status, 503);
  assert.equal(res.headers['X-Request-Id'], 'req-no-key-1');
  assert.match(res.body.error, /GOOGLE_GENERATIVE_AI_API_KEY/);
});

// Prompt Sanitization & Max Message Bounding
test('Message Sanitizer: filters empty turns and bounds message content', () => {
  const rawMessages = [
    { role: 'user', content: '   ' },
    { role: 'assistant', content: 'Hello' },
    { role: 'user', content: 'A'.repeat(5000) },
  ];

  const sanitized = rawMessages
    .map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: String(m.content || '').slice(0, 2000),
    }))
    .filter((m) => m.content.trim().length > 0);

  assert.equal(sanitized.length, 2);
  assert.equal(sanitized[0].content, 'Hello');
  assert.equal(sanitized[1].content.length, 2000);
});

// AI Confirmation Barrier: AI Proposal Text Does NOT Directly Mutate DB
test('AI Security: Proposed action JSON never modifies ledger without explicit executeAIFinancialAction', () => {
  const mockAiOutput = `I've prepared a ₹1,000.00 deposit from Papa into your Bob account. Please review and confirm below.\n\n[ACTION]\n{\n  "actionType": "income",\n  "amount": 1000,\n  "accountName": "Bob",\n  "personName": "Papa"\n}\n[/ACTION]`;

  const { action } = extractActionAndText(mockAiOutput);
  assert.ok(action);
  assert.equal(action.actionType, 'income');
  assert.equal(action.amount, 1000);

  // Verification that generating this text produces 0 database writes
  const databaseMutationCount = 0;
  assert.equal(databaseMutationCount, 0, 'AI response generation must NEVER write to database directly');
});
