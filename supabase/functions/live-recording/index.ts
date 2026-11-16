import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EncodedFileOutput, EgressClient, S3Upload } from 'https://esm.sh/livekit-server-sdk@2';

const cors = { 'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return json({ error: 'Invalid session' }, 401);
  const { data: profile } = await client.from('profiles').select('role,status').eq('id', user.id).single();
  if (!profile || !['teacher','admin'].includes(profile.role) || profile.status !== 'active') return json({ error: 'Staff access required' }, 403);
  const { sessionId, action } = await req.json();
  if (typeof sessionId !== 'string' || !['start','stop'].includes(action)) return json({ error: 'Invalid request' }, 400);
  const { data: session } = await client.from('live_sessions').select('id,room_name,host_id,status,recording_egress_id,recording_path,title,description,level,subject,chapter,class_id').eq('id', sessionId).single();
  if (!session || (profile.role !== 'admin' && session.host_id !== user.id)) return json({ error: 'Not authorized for this session' }, 403);
  if (action === 'start' && (session.status !== 'live' || session.recording_egress_id)) return json({ error: 'Start the LIVE first, or stop its current recording' }, 409);
  if (action === 'stop' && !session.recording_egress_id) return json({ error: 'No recording is active' }, 409);
  const livekitUrl = Deno.env.get('LIVEKIT_URL');
  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!livekitUrl || !apiKey || !apiSecret) return json({ error: 'LIVE service is not configured' }, 503);
  const egressHttpUrl = livekitUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  const egress = new EgressClient(egressHttpUrl, apiKey, apiSecret);
  if (action === 'stop') {
    const active = await egress.listEgress(session.room_name);
    if (!active.some((item) => item.egressId === session.recording_egress_id)) return json({ error: 'Recording was not found in this room' }, 404);
    const stopped = await egress.stopEgress(session.recording_egress_id);
    const { error: replayError } = await client.from('replays').upsert({ title: session.title, description: session.description, level: session.level, subject: session.subject, chapter: session.chapter, class_id: session.class_id, storage_path: session.recording_path, uploaded_by: session.host_id, published: false }, { onConflict: 'storage_path' });
    if (replayError) return json({ error: 'Recording stopped, but its replay draft could not be created' }, 500);
    await client.from('live_sessions').update({ recording_egress_id: null }).eq('id', session.id);
    return json({ status: stopped.status, recordingPath: session.recording_path });
  }
  const accessKey = Deno.env.get('STORAGE_S3_ACCESS_KEY');
  const secretKey = Deno.env.get('STORAGE_S3_SECRET_KEY');
  const endpoint = Deno.env.get('STORAGE_S3_ENDPOINT');
  const bucket = Deno.env.get('STORAGE_S3_BUCKET') || 'private-lessons';
  const region = Deno.env.get('STORAGE_S3_REGION') || 'us-east-1';
  if (!accessKey || !secretKey || !endpoint) return json({ error: 'Private storage recording credentials are not configured' }, 503);
  const path = `${user.id}/${session.id}/${Date.now()}.mp4`;
  try {
    const output = new EncodedFileOutput({ filepath: path, output: { case: 's3', value: new S3Upload({ accessKey, secret: secretKey, region, bucket, endpoint, forcePathStyle: true }) } });
    const started = await egress.startRoomCompositeEgress(session.room_name, output, { layout: 'grid' });
    const { error } = await client.from('live_sessions').update({ recording_path: path, recording_egress_id: started.egressId }).eq('id', session.id);
    if (error) { await egress.stopEgress(started.egressId); return json({ error: 'Could not save recording state' }, 500); }
    return json({ egressId: started.egressId, recordingPath: path, status: started.status }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Recording could not be started' }, 500);
  }
});
