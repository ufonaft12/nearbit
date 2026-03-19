import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// ── Validation schema ──────────────────────────────────────────────────────────

const PatchBodySchema = z.object({
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(200).nullable().optional(),
});

// ── GET /api/profile ───────────────────────────────────────────────────────────

export async function GET(_request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('address, city, updated_at')
    .eq('user_id', user.id)
    .single();

  // PGRST116 = "no rows returned" — profile doesn't exist yet, return empty
  if (error && error.code !== 'PGRST116') {
    console.error('[profile GET]', error.message);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json(
    data ?? { address: null, city: null, updated_at: null },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

// ── PATCH /api/profile ─────────────────────────────────────────────────────────

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 422 },
    );
  }

  // Build only the fields that were explicitly provided
  const updates: Record<string, unknown> = { user_id: user.id };
  if ('address' in parsed.data) updates.address = parsed.data.address ?? null;
  if ('city' in parsed.data) updates.city = parsed.data.city ?? null;

  const { error } = await supabase
    .from('profiles')
    .upsert(updates, { onConflict: 'user_id' });

  if (error) {
    console.error('[profile PATCH]', error.message);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
