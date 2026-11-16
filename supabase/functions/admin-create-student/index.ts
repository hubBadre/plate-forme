import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return json({ error: 'Invalid session' }, 401);
  const { data: caller } = await userClient.from('profiles').select('role,status').eq('id', user.id).single();
  if (!caller || !['teacher','admin'].includes(caller.role) || caller.status !== 'active') return json({ error: 'Staff access required' }, 403);
  const body = await req.json();
  const email = String(body.email ?? '').trim().toLowerCase();
  const firstName = String(body.firstName ?? '').trim();
  const lastName = String(body.lastName ?? '').trim();
  const level = String(body.level ?? '');
  const classId = body.classId ? String(body.classId) : null;
  if (!email.includes('@') || !firstName || !lastName || !['Tronc Commun','1BAC','2BAC'].includes(level)) return json({ error: 'Invalid student details' }, 400);
  if (classId) {
    const { data: selectedClass, error: classError } = await userClient.from('classes').select('id,level').eq('id', classId).single();
    if (classError || selectedClass?.level !== level) return json({ error: 'Choose a class that matches the student level' }, 400);
  }
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json({ error: 'Invitation service unavailable' }, 503);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { first_name: firstName, last_name: lastName, level } });
  if (inviteError || !data.user) return json({ error: inviteError?.message ?? 'Could not create invitation' }, 400);
  if (classId) {
    const { error: membershipError } = await admin.from('class_members').insert({ class_id: classId, student_id: data.user.id });
    if (membershipError) return json({ error: 'Student invited but class assignment failed' }, 500);
  }
  return json({ id: data.user.id, email: data.user.email, status: 'pending' }, 201);
});
