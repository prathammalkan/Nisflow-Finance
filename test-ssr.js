const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const http = require('http');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function testSSR() {
  const email = 'test_ssr_' + Date.now() + '@example.com';
  const { data: authData } = await supabase.auth.signUp({
    email, password: 'Password123!', options: { data: { full_name: 'SSR Test' } }
  });

  const session = authData.session;
  console.log('Got session:', session.access_token.substring(0, 20) + '...');

  // Construct cookies
  // Supabase sets sb-<project-id>-auth-token
  const projectId = url.match(/\/\/([^.]+)\./)[1];
  const cookieName = `sb-${projectId}-auth-token`;
  
  // Format the cookie value as Supabase SSR expects it
  const cookieValue = JSON.stringify([session.access_token, session.refresh_token, null, null, null]);
  const cookieHeader = `${cookieName}=${encodeURIComponent(cookieValue)}`;

  console.log('Fetching /dashboard SSR with cookie...');
  const res = await fetch('http://localhost:3000/dashboard', {
    headers: {
      'Cookie': cookieHeader
    }
  });

  console.log('Status:', res.status);
  const text = await res.text();
  
  if (text.includes('Error') || text.includes('Unhandled Runtime Error') || text.includes('Minified React error')) {
    console.log('Found an error in the HTML output!');
    const snippet = text.substring(text.indexOf('Error'), text.indexOf('Error') + 1000);
    console.log(snippet);
  } else {
    console.log('No obvious error strings found in HTML. length:', text.length);
  }
}

testSSR();
