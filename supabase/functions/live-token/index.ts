import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken } from 'https://esm.sh/livekit-server-sdk@2';

const cors = { 'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Invalid session' }, 401);
  const { data: profile } = await userClient.from('profiles').select('role,status,approved_at,first_name,last_name').eq('id', user.id).single();
  if (!profile || profile.status !== 'active' || (profile.role === 'student' && !profile.approved_at)) return json({ error: 'Account not approved' }, 403);
  const { sessionId } = await req.json();
  if (typeof sessionId !== 'string') return json({ error: 'Invalid session id' }, 400);
  const { data: session } = await userClient.from('live_sessions').select('id,room_name,host_id,class_id,status').eq('id', sessionId).single();
  if (!session || !['scheduled','live'].includes(session.status)) return json({ error: 'Session unavailable' }, 404);
  const isStaff = ['teacher','admin'].includes(profile.role);
  const isHost = profile.role === 'admin' || (profile.role === 'teacher' && session.host_id === user.id);
  if (!isHost && session.status !== 'live') return json({ error: 'This LIVE has not started yet' }, 403);
  let isMember = false;
  if (session.class_id) {
    const { data: membership } = await userClient.from('class_members').select('class_id').eq('class_id', session.class_id).eq('student_id', user.id).maybeSingle();
    isMember = Boolean(membership);
  }
  if (!isHost && !isMember) return json({ error: 'Not authorized for this LIVE' }, 403);
  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  const livekitUrl = Deno.env.get('LIVEKIT_URL');
  if (!apiKey || !apiSecret || !livekitUrl) return json({ error: 'LIVE service is not configured' }, 503);
  const token = new AccessToken(apiKey, apiSecret, { identity: user.id, name: `${profile.first_name} ${profile.last_name}`.trim(), ttl: '1h' });
  token.addGrant({ roomJoin: true, room: session.room_name, canPublish: isHost, canSubscribe: true, canPublishData: true });
  return json({ token: await token.toJwt(), serverUrl: livekitUrl });
});
