import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Next.js 16: "proxy" is the new convention, "middleware" is kept as required runtime entry
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Alias for Next.js 16 proxy convention
export { middleware as proxy };

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
