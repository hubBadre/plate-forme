import React, { Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getCurrentProfile, isSupabaseConfigured, supabase, uploadPrivateFile } from './lib/supabase';
import { AdminStudents, LiveManager, ResourcesManager, StudentSchedule } from './admin';
import ExternalCourses from './instagram-courses';
import './styles.css';

const LiveRoom = React.lazy(() => import('./live-room.jsx'));

const Icon = ({ name, size = 20 }) => {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    play: <><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/></>, book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5V21M8 7h8M8 11h7"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>, users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>, settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 1 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 1 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 1 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 1 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>, arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};

const lessons = [
  { subject: 'Mathématiques', topic: 'Les fonctions polynômes', chapter: 'Chapitre 04 · Équations', level: '1BAC', color: 'violet', length: '1 h 24', initials: 'MA' },
  { subject: 'Physique', topic: 'Mouvement et trajectoire', chapter: 'Chapitre 02 · Mécanique', level: 'Tronc Commun', color: 'blue', length: '58 min', initials: 'PH' },
  { subject: 'Chimie', topic: 'Réactions d’oxydoréduction', chapter: 'Chapitre 06 · Chimie', level: '2BAC', color: 'orange', length: '1 h 12', initials: 'CH' },
];

function App() {
  const [page, setPage] = useState('dashboard');
  const [role, setRole] = useState('student');
  const [profile, setProfile] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState({ level: 'Tous les niveaux', subject: 'Toutes les matières', chapter: 'Tous les chapitres' });
  const [query, setQuery] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [liveRoom, setLiveRoom] = useState(null);
  const [recording, setRecording] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [replayUrl, setReplayUrl] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editReplay, setEditReplay] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [classOptions, setClassOptions] = useState([]);

  useEffect(() => { getCurrentProfile().then((data) => { if (data) { setProfile(data.profile); setRole(data.profile.role); } }).catch(() => {}).finally(() => setSessionChecked(true)); }, []);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3600); return () => clearTimeout(timer); }, [message]);
  useEffect(() => {
    if (!profile || !supabase) { setCatalog(null); return; }
    loadCatalog();
    if (['teacher','admin'].includes(profile.role)) supabase.from('classes').select('id,name,level').order('name').then(({data})=>setClassOptions(data||[]));
  }, [profile?.id, role]);

  async function signIn(event) {
    event.preventDefault();
    if (!supabase) { setMessage('Configurez Supabase pour activer les comptes sécurisés.'); return; }
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
    if (error) { setMessage(error.message); return; }
    const result = await getCurrentProfile();
    if (!result?.profile?.approved_at || result.profile.status !== 'active') { await supabase.auth.signOut(); setMessage('Votre compte attend la validation du professeur.'); return; }
    setProfile(result.profile); setRole(result.profile.role); setAuthOpen(false); setMessage('Connexion réussie.');
  }
  async function signOut() { if (supabase) await supabase.auth.signOut(); setProfile(null); setPage('dashboard'); setMessage('Vous êtes déconnecté.'); }
  async function loadCatalog() {
    if (!supabase || !profile) return;
    let request = supabase.from('replays').select('id,title,description,level,subject,chapter,storage_path,duration_seconds,published,published_at').order('published_at', { ascending: false, nullsFirst: false });
    if (!['teacher','admin'].includes(role)) request = request.eq('published', true);
    const { data, error } = await request;
    if (error) setMessage(error.message); else setCatalog(data || []);
  }

  async function playReplay(replay) {
    if (!profile) { setAuthOpen(true); return; }
    const { data, error } = await supabase.storage.from('private-lessons').createSignedUrl(replay.storage_path, 300);
    if (error) { setMessage(error.message); return; }
    setReplayUrl(data.signedUrl);
  }
  async function publishReplay(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('video');
    if (!file || !file.size || !supabase || !profile) return;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${profile.id}/${crypto.randomUUID()}-${safeName}`;
    setUploadProgress(0);
    try { await uploadPrivateFile(storagePath, file, setUploadProgress); } catch (uploadError) { setUploadProgress(null); setMessage(uploadError.message); return; }
    const { error } = await supabase.from('replays').insert({ title: form.get('title'), description: form.get('description'), level: form.get('level'), subject: form.get('subject'), chapter: form.get('chapter'), class_id: form.get('classId')||null, storage_path: storagePath, published: true, published_at: new Date().toISOString(), uploaded_by: profile.id });
    if (error) { await supabase.storage.from('private-lessons').remove([storagePath]); setUploadProgress(null); setMessage(error.message); return; }
    setUploadProgress(null); setUploadOpen(false); setMessage('Le replay est publié dans la bibliothèque.'); await loadCatalog();
  }
  async function saveReplay(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const { error } = await supabase.from('replays').update({ title: form.get('title'), description: form.get('description'), level: form.get('level'), subject: form.get('subject'), chapter: form.get('chapter'), updated_at: new Date().toISOString() }).eq('id', editReplay.id);
    if (error) { setMessage(error.message); return; }
    setEditReplay(null); setMessage('Replay modifié.'); await loadCatalog();
  }
  async function deleteReplay(item) {
    if (!window.confirm(`Supprimer « ${item.title} » et sa vidéo privée ?`)) return;
    const { error } = await supabase.from('replays').delete().eq('id', item.id);
    if (error) { setMessage(error.message); return; }
    const { error: storageError } = await supabase.storage.from('private-lessons').remove([item.storage_path]);
    setMessage(storageError ? `Replay supprimé. Le fichier reste à nettoyer : ${storageError.message}` : 'Replay et vidéo supprimés.');
    await loadCatalog();
  }
  async function toggleReplay(item) {
    const { error } = await supabase.from('replays').update({ published: !item.published, published_at: !item.published ? new Date().toISOString() : null }).eq('id', item.id);
    if (error) { setMessage(error.message); return; }
    setMessage(item.published ? 'Replay retiré de la bibliothèque.' : 'Replay publié dans la bibliothèque.'); await loadCatalog();
  }
  async function joinLive(session) {
    if (!profile || !supabase) { setAuthOpen(true); return; }
    const { data, error } = await supabase.functions.invoke('live-token', { body: { sessionId: session.id } });
    if (error || !data?.token) { setMessage(error?.message || data?.error || 'Impossible de rejoindre ce LIVE.'); return; }
    setLiveRoom({ ...data, session });
  }
  async function endLive() {
    if (!liveRoom) return;
    if (recording && ['teacher','admin'].includes(role)) {
      const { error } = await supabase.functions.invoke('live-recording', { body: { sessionId: liveRoom.session.id, action: 'stop' } });
      if (error) setMessage(error.message);
      setRecording(false);
    }
    if (['teacher','admin'].includes(role)) await supabase.from('live_sessions').update({ status: 'ended' }).eq('id', liveRoom.session.id);
    setLiveRoom(null); setMessage('Le LIVE est terminé.');
  }
  async function toggleRecording() {
    if (!liveRoom || !['teacher','admin'].includes(role)) return;
    const action = recording ? 'stop' : 'start';
    const { data, error } = await supabase.functions.invoke('live-recording', { body: { sessionId: liveRoom.session.id, action } });
    if (error || data?.error) { setMessage(data?.error || error.message); return; }
    setRecording(!recording); setMessage(recording ? 'Enregistrement terminé et conservé dans le stockage privé.' : 'Enregistrement de la séance démarré.');
    if (recording) await loadCatalog();
  }

  const studentNav = [['dashboard', 'Vue d’ensemble', 'grid'], ['replays', 'Anciens LIVE', 'play'], ['instagram', 'Cours Instagram', 'play'], ['facebook', 'Cours Facebook', 'play'], ['schedule', 'Planning', 'calendar'], ['resources', 'Ressources', 'file']];
  const teacherNav = [['dashboard', 'Vue d’ensemble', 'grid'], ['students', 'Mes élèves', 'users'], ['live', 'LIVE & planning', 'calendar'], ['replays', 'Anciens LIVE', 'play'], ['instagram', 'Cours Instagram', 'play'], ['facebook', 'Cours Facebook', 'play'], ['resources', 'Ressources', 'file']];
  const nav = role === 'teacher' || role === 'admin' ? teacherNav : studentNav;
  const sourceLessons = profile ? (catalog||[]).map((item) => ({ ...item, topic: item.title, length: item.duration_seconds ? `${Math.round(item.duration_seconds / 60)} min` : 'Replay', initials: item.subject.slice(0, 2).toUpperCase(), color: item.subject === 'Mathématiques' ? 'violet' : item.subject === 'Physique' ? 'blue' : 'orange' })) : lessons;
  const shownLessons = sourceLessons.filter((item) => (filter.level === 'Tous les niveaux' || item.level === filter.level) && (filter.subject === 'Toutes les matières' || item.subject === filter.subject) && (filter.chapter === 'Tous les chapitres' || item.chapter === filter.chapter) && `${item.topic} ${item.chapter} ${item.subject}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">c<span>.</span></div><div><strong>classe</strong><small>COURS DU SOIR</small></div></div>
      <div className="workspace-label">ESPACE {role === 'teacher' || role === 'admin' ? 'PROFESSEUR' : 'ÉLÈVE'}</div>
      <nav aria-label="Navigation principale">{nav.map(([id, label, icon]) => <button key={id} className={`nav-link ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}><Icon name={icon}/><span>{label}</span>{id === 'live' && <i className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="support-card"><div className="support-icon"><Icon name="file" size={18}/></div><strong>Besoin d’aide ?</strong><p>Retrouvez les réponses à vos questions.</p><button onClick={() => setMessage('Le support sera bientôt disponible.')}>Centre d’aide <Icon name="arrow" size={15}/></button></div><button className="nav-link" onClick={() => setMessage('Les préférences seront bientôt disponibles.')}><Icon name="settings"/><span>Paramètres</span></button><div className="profile-row"><div className="avatar">{profile?.first_name?.[0] || 'A'}{profile?.last_name?.[0] || 'B'}</div><div className="profile-meta"><strong>{profile ? `${profile.first_name} ${profile.last_name}` : role === 'teacher' ? 'Professeur' : 'Élève invité'}</strong><small>{profile?.level || (role === 'teacher' ? 'Enseignant' : 'Connectez-vous')}</small></div><button className="more-button" aria-label="Se déconnecter" onClick={profile ? signOut : () => setAuthOpen(true)}>···</button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs">Espace de travail <span>/</span> <strong>{nav.find(([id]) => id === page)?.[1] || 'Vue d’ensemble'}</strong></div><div className="top-actions"><label className="search-box"><Icon name="search" size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un cours..." aria-label="Rechercher"/><kbd>⌘ K</kbd></label><button className="icon-button" aria-label="Notifications" onClick={() => setMessage('Vous êtes à jour.')}><Icon name="bell"/><i/></button><div className="top-avatar">{profile?.first_name?.[0] || 'A'}</div></div></header>
      <div className="content">
        {!sessionChecked && <div className="session-note">Vérification de votre session…</div>}
        {page === 'dashboard' && <Dashboard role={role} profile={profile} replays={catalog||[]} setPage={setPage} setMessage={setMessage} openAuth={() => setAuthOpen(true)} />}
        {page === 'replays' && <section><PageTitle eyebrow="À LA DEMANDE" title="Anciens LIVE" description="Retrouvez les séances et révisez à votre rythme."/><div className="filter-bar"><div className="filter-heading"><strong>Bibliothèque de cours</strong><span>{shownLessons.length} séances</span></div>{['teacher','admin'].includes(role)&&<button className="button primary" onClick={()=>setUploadOpen(true)}>+ Publier un replay</button>}<select value={filter.level} onChange={(e) => setFilter({...filter, level:e.target.value})} aria-label="Filtrer par niveau"><option>Tous les niveaux</option><option>Tronc Commun</option><option>1BAC</option><option>2BAC</option></select><select value={filter.subject} onChange={(e) => setFilter({...filter, subject:e.target.value})} aria-label="Filtrer par matière"><option>Toutes les matières</option><option>Mathématiques</option><option>Physique</option><option>Chimie</option></select><select value={filter.chapter} onChange={(e)=>setFilter({...filter,chapter:e.target.value})} aria-label="Filtrer par chapitre"><option>Tous les chapitres</option>{[...new Set(sourceLessons.map((item)=>item.chapter).filter(Boolean))].map((chapter)=><option key={chapter}>{chapter}</option>)}</select></div>{!profile&&<p className="demo-note">Aperçu de la bibliothèque. Connectez-vous avec un compte validé pour voir les replays privés.</p>}<div className="course-grid">{shownLessons.map((l,i)=><div className="library-card-wrap" key={l.id||l.topic}><CourseCard lesson={l} index={i} onClick={() => l.id ? playReplay(l) : setMessage('Configurez Supabase et connectez-vous pour accéder aux replays privés.')}/>{['teacher','admin'].includes(role)&&l.id&&<div className="library-management"><button className={!l.published?'draft-label':''} onClick={()=>toggleReplay(l)}>{l.published?'Dépublier':'Publier'}</button><button onClick={()=>setEditReplay(l)}>Modifier</button><button onClick={()=>deleteReplay(l)}>Supprimer</button></div>}</div>)}</div>{shownLessons.length === 0 && <div className="empty-state">Aucun replay publié ne correspond à votre recherche.</div>}</section>}
        {page === 'schedule' && (['teacher','admin'].includes(role)?<LiveManager profile={profile} role={role} joinLive={joinLive} setMessage={setMessage}/>:profile?<StudentSchedule profile={profile} joinLive={joinLive}/>:<section><PageTitle eyebrow="À VENIR" title="Planning des cours" description="Connectez-vous pour consulter les séances de votre classe."/><div className="empty-state"><button className="button secondary" onClick={()=>setAuthOpen(true)}>Se connecter</button></div></section>)}
        {page === 'resources' && (profile?<ResourcesManager profile={profile} role={role} setMessage={setMessage}/>:<section><PageTitle eyebrow="VOTRE MATÉRIEL" title="Ressources" description="Documents, exercices et corrections partagés par votre professeur."/><div className="resource-placeholder"><div className="resource-orb"><Icon name="file" size={26}/></div><h3>Vos ressources de cours</h3><p>Connectez-vous avec votre compte validé pour consulter les documents privés.</p><button className="button secondary" onClick={()=>setAuthOpen(true)}>Se connecter <Icon name="arrow" size={16}/></button></div></section>)}
        {page === 'students' && <AdminStudents setMessage={setMessage}/>}
        {page === 'live' && <LiveManager profile={profile} role={role} joinLive={joinLive} setMessage={setMessage}/>}
        {page === 'instagram' && <ExternalCourses key="instagram" platform="instagram" profile={profile} role={role} classes={classOptions} setMessage={setMessage} openAuth={() => setAuthOpen(true)}/>}
        {page === 'facebook' && <ExternalCourses key="facebook" platform="facebook" profile={profile} role={role} classes={classOptions} setMessage={setMessage} openAuth={() => setAuthOpen(true)}/>}
      </div>
    </main>
    {authOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(e)=>e.target===e.currentTarget&&setAuthOpen(false)}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="login-heading"><button className="modal-close" onClick={()=>setAuthOpen(false)} aria-label="Fermer">×</button><div className="brand-mark modal-mark">c<span>.</span></div><p className="eyebrow">VOTRE ESPACE DE COURS</p><h2 id="login-heading">Ravi de vous revoir.</h2><p className="modal-copy">Connectez-vous pour accéder à vos cours et ressources privés.</p><form onSubmit={signIn}><label>Adresse e-mail<input name="email" type="email" autoComplete="email" placeholder="vous@exemple.com" required/></label><label>Mot de passe<input name="password" type="password" autoComplete="current-password" placeholder="8 caractères minimum" required/></label><button className="button primary full" type="submit">Se connecter <Icon name="arrow" size={17}/></button></form><div className="modal-foot">Votre compte est créé et validé par votre professeur.</div>{!isSupabaseConfigured&&<div className="config-hint">Connexion en attente de la configuration Supabase.</div>}</section></div>}
    {uploadOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={(e)=>e.target===e.currentTarget&&uploadProgress===null&&setUploadOpen(false)}><section className="auth-modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title"><button className="modal-close" onClick={()=>uploadProgress===null&&setUploadOpen(false)} aria-label="Fermer">×</button><p className="eyebrow">BIBLIOTHÈQUE VIDÉO</p><h2 id="upload-title">Publier un ancien LIVE</h2><p className="modal-copy">La vidéo est stockée dans l’espace privé de la plateforme.</p><form onSubmit={publishReplay}><label>Fichier vidéo<input name="video" type="file" accept="video/mp4,video/webm" required/></label>{uploadProgress!==null&&<div className="upload-progress"><span style={{width:`${uploadProgress}%`}}/><b>{uploadProgress}%</b></div>}<label>Titre<input name="title" required maxLength="140" placeholder="Ex. Limites et continuité"/></label><label>Description<textarea name="description" rows="3"/></label><div className="form-two"><label>Niveau<select name="level" required><option>Tronc Commun</option><option>1BAC</option><option>2BAC</option></select></label><label>Matière<select name="subject" required><option>Mathématiques</option><option>Physique</option><option>Chimie</option></select></label></div><label>Chapitre<input name="chapter" required placeholder="Ex. Chapitre 04 · Équations"/></label><label>Classe (facultatif)<select name="classId"><option value="">Tous les élèves approuvés</option>{classOptions.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select></label><button className="button primary full" type="submit" disabled={uploadProgress!==null}>{uploadProgress!==null?`Téléversement ${uploadProgress}%`:'Téléverser et publier'}</button></form></section></div>}
    {editReplay&&<div className="modal-backdrop"><section className="auth-modal wide-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={()=>setEditReplay(null)} aria-label="Fermer">×</button><p className="eyebrow">BIBLIOTHÈQUE VIDÉO</p><h2>Modifier le replay</h2><form onSubmit={saveReplay}><label>Titre<input name="title" defaultValue={editReplay.title} required/></label><label>Description<textarea name="description" rows="3" defaultValue={editReplay.description}/></label><div className="form-two"><label>Niveau<select name="level" defaultValue={editReplay.level}>{['Tronc Commun','1BAC','2BAC'].map((v)=><option key={v}>{v}</option>)}</select></label><label>Matière<select name="subject" defaultValue={editReplay.subject}>{['Mathématiques','Physique','Chimie'].map((v)=><option key={v}>{v}</option>)}</select></label></div><label>Chapitre<input name="chapter" defaultValue={editReplay.chapter} required/></label><button className="button primary full">Enregistrer les modifications</button></form></section></div>}
    {replayUrl&&<div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setReplayUrl('')}><section className="player-modal" role="dialog" aria-modal="true" aria-label="Lecture du replay"><button className="modal-close player-close" onClick={()=>setReplayUrl('')} aria-label="Fermer">×</button><video controls autoPlay src={replayUrl}/><p>Ce lien de lecture privé expire automatiquement.</p></section></div>}
    {liveRoom&&<div className="live-overlay"><div className="live-overlay-bar"><div><span className="live-pill"><i/> EN DIRECT</span><strong>{liveRoom.session.title}</strong></div><div className="live-bar-actions">{['teacher','admin'].includes(role)&&<button className={`button ${recording?'recording-button':'secondary'}`} onClick={toggleRecording}><i className={recording?'recording-dot':''}/>{recording?'Arrêter l’enregistrement':'Enregistrer'}</button>}<button className="button primary" onClick={endLive}>{['teacher','admin'].includes(role)?'Terminer le LIVE':'Quitter le LIVE'}</button></div></div><Suspense fallback={<div className="live-loading">Connexion à la salle…</div>}><LiveRoom token={liveRoom.token} serverUrl={liveRoom.serverUrl} onDisconnected={()=>setLiveRoom(null)}/></Suspense></div>}
    {message&&<div className="toast" role="status"><span className="toast-check"><Icon name="check" size={15}/></span>{message}</div>}
  </div>;
}

function PageTitle({eyebrow,title,description}) { return <div className="page-title"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>; }
function StatCard({ label, value, detail, icon, tone }) {
  return <div className="stat-card">
    <div className={`stat-icon ${tone}`}><Icon name={icon} size={16}/></div>
    <p>{label}</p>
    <div className="stat-value">{value}</div>
    <small>{detail}</small>
  </div>;
}
function Dashboard({role,profile,replays,setPage,setMessage,openAuth}) {
  const teacher = role === 'teacher' || role === 'admin';
  const today = new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date()).toLocaleUpperCase('fr-FR');
  const [sessions,setSessions]=useState([]);
  useEffect(()=>{let active=true;if(!profile||!supabase){setSessions([]);return;}supabase.from('live_sessions').select('id,title,level,subject,scheduled_at,status').in('status',['scheduled','live']).order('scheduled_at').limit(2).then(({data})=>{if(active)setSessions(data||[]);});return()=>{active=false;};},[profile?.id]);
  const recentReplays=profile?replays.slice(0,2).map((item)=>({...item,topic:item.title,initials:item.subject.slice(0,2).toUpperCase(),color:item.subject==='Mathématiques'?'violet':item.subject==='Physique'?'blue':'orange'})):lessons.slice(0,2);
  const upcomingEvents=sessions.map((item)=>{const date=new Date(item.scheduled_at);return {day:date.toLocaleDateString('fr-FR',{day:'2-digit'}),month:date.toLocaleDateString('fr-FR',{month:'short'}).toUpperCase(),subject:item.subject,title:item.title,time:date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),tag:item.level};});
  return <>
    <div className="welcome-row"><div><p className="eyebrow">{teacher ? 'TABLEAU DE BORD' : today}</p><h1>{teacher ? 'Bonjour, professeur' : `Bonsoir${profile?.first_name ? `, ${profile.first_name}` : ''} 👋`}</h1><p className="welcome-copy">{teacher ? 'Voici ce qui se passe dans vos classes aujourd’hui.' : 'Prêt à progresser ? Voici votre espace de travail.'}</p></div><div className="welcome-actions">{!profile&&<button className="button secondary" onClick={openAuth}>Se connecter</button>}{teacher&&<button className="button primary" onClick={()=>setPage('live')}><span className="live-dot"/> Démarrer un LIVE</button>}</div></div>
    {!profile&&!teacher&&<div className="access-banner"><div className="lock-symbol">✳</div><div><strong>Votre espace personnel vous attend</strong><p>Connectez-vous avec le compte validé par votre professeur pour accéder aux cours privés.</p></div><button className="banner-link" onClick={openAuth}>Se connecter <Icon name="arrow" size={16}/></button></div>}
    <DashboardStats role={role} profile={profile}/>
    <div className="section-heading"><div><p className="eyebrow">{teacher?'VOTRE PROGRAMME':profile?'POUR BIEN CONTINUER':'APERÇU DE LA BIBLIOTHÈQUE'}</p><h2>{teacher?'Prochain LIVE':profile?'Vos derniers replays':'Exemples de cours'}</h2></div><button className="text-link" onClick={()=>setPage(teacher?'live':'replays')}>{teacher?'Voir le planning':'Toute la bibliothèque'} <Icon name="arrow" size={16}/></button></div>
    <div className="dashboard-grid"><div className="left-column">{teacher?<div className="teacher-live-card"><div className="live-card-top"><span className="live-pill"><i/> VOTRE ESPACE LIVE</span></div><h3>{sessions[0]?.title||'Programmez votre prochaine séance'}</h3><p>{sessions[0]?`${sessions[0].subject} · ${sessions[0].level}`:'Vos élèves pourront rejoindre vos diffusions privées.'}</p><div className="live-card-footer"><div className="attendee-stack"><small>{sessions[0]?new Date(sessions[0].scheduled_at).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'}):'Caméra · micro · partage d’écran'}</small></div><button onClick={()=>setPage('live')}>Gérer les LIVE <Icon name="arrow" size={15}/></button></div></div>:recentReplays.length?recentReplays.map((lesson,i)=><CourseRow key={lesson.id||lesson.topic} lesson={lesson} progress={profile?null:i===0?68:32} onClick={()=>setPage('replays')}/>):<div className="empty-state">Aucun replay publié pour votre classe pour le moment.</div>}</div><div className="upcoming-panel"><div className="upcoming-heading"><h3>À venir</h3><button aria-label="Voir le planning" onClick={()=>setPage('schedule')}><Icon name="calendar" size={17}/></button></div>{upcomingEvents.length?upcomingEvents.map(e=><EventCard key={e.title} event={e} compact onClick={()=>setPage('schedule')}/>):<p className="panel-empty">{profile?'Aucun LIVE programmé pour le moment.':'Connectez-vous pour voir le planning de votre classe.'}</p>}</div></div>
    <div className="promo-strip"><div className="promo-icon"><Icon name="book" size={20}/></div><div><strong>{teacher?'Votre bibliothèque, toujours à jour':'Un cours manqué ? Il vous attend en replay.'}</strong><p>{teacher?'Publiez les enregistrements pour aider les élèves à réviser.':'Retrouvez les dernières séances et avancez à votre rythme.'}</p></div><button onClick={()=>setPage('replays')}>{teacher?'Gérer les replays':'Voir les replays'} <Icon name="arrow" size={16}/></button><div className="promo-decoration"/></div>
  </>;
}
function DashboardStats({role,profile}) {
  const [counts,setCounts]=useState(null); const teacher=['teacher','admin'].includes(role);
  useEffect(()=>{let active=true;if(!profile||!supabase){setCounts(null);return;}const get=async()=>{const count=async(table,filters=[])=>{let request=supabase.from(table).select('id',{count:'exact',head:true});for(const [field,operator,value] of filters)request=operator==='in'?request.in(field,value):request.eq(field,value);const result=await request;return result.error?null:result.count??0;};const values=teacher?await Promise.all([count('profiles',[['role','eq','student'],['status','eq','active']]),count('live_sessions',[['host_id','eq',profile.id],['status','in',['scheduled','live']]]),count('replays',[['uploaded_by','eq',profile.id],['published','eq',true]])]):await Promise.all([count('replays',[['published','eq',true]]),count('live_sessions',[['status','in',['scheduled','live']]]),count('resources',[['published','eq',true]])]);if(active)setCounts(values);};get();return()=>{active=false;};},[profile?.id,role]);
  const values=counts||['—','—','—'];return <div className="stats-grid"><StatCard label={teacher?'ÉLÈVES ACTIFS':'REPLAYS DISPONIBLES'} value={values[0]} detail={counts?(teacher?'dans vos classes':'à consulter'):'données sécurisées'} icon="users" tone="mint"/><StatCard label={teacher?'LIVE À VENIR':'LIVE DE VOTRE CLASSE'} value={values[1]} detail={counts?'séances programmées':'connexion requise'} icon="play" tone="lilac"/><StatCard label={teacher?'REPLAYS PUBLIÉS':'RESSOURCES PUBLIÉES'} value={values[2]} detail={counts?'dans votre espace':'connexion requise'} icon="book" tone="peach"/></div>;
}
function CourseRow({lesson,progress,onClick}) { return <button className="course-row" onClick={onClick}><div className={`course-thumb ${lesson.color}`}><span>{lesson.initials}</span><i><Icon name="play" size={17}/></i></div><div className="course-row-copy"><span className="course-subject">{lesson.subject} <i>·</i> {lesson.level}</span><strong>{lesson.topic}</strong><small>{lesson.chapter}</small>{progress!=null&&<div className="progress-track"><span style={{width:`${progress}%`}}/></div>}</div>{progress!=null&&<span className="course-progress">{progress}%</span>}</button>; }
function EventCard({event,compact,onClick}) { return <button className={`event-card ${compact?'compact':''}`} onClick={onClick}><div className="event-date"><strong>{event.day}</strong><small>{event.month}</small></div><div className="event-copy"><span>{event.subject} <i>·</i> {event.tag}</span><strong>{event.title}</strong><small><Icon name="clock" size={13}/>{event.time}</small></div>{!compact&&<span className="event-arrow"><Icon name="arrow" size={17}/></span>}</button>; }
function CourseCard({lesson,index,onClick}) { return <button className="library-card" onClick={onClick}><div className={`library-thumb ${lesson.color}`}><span className="thumb-monogram">{lesson.initials}</span><span className="thumb-number">0{index+1}</span><span className="duration">{lesson.length}</span><span className="play-round"><Icon name="play" size={17}/></span></div><div className="library-copy"><div className="tag-row"><span className={`subject-tag ${lesson.color}`}>{lesson.subject}</span><span className="level-tag">{lesson.level}</span></div><h3>{lesson.topic}</h3><p>{lesson.chapter}</p><div className="teacher-line"><div className="mini-avatar">P</div><span>Votre professeur</span><span className="card-arrow"><Icon name="arrow" size={16}/></span></div></div></button>; }

createRoot(document.getElementById('root')).render(<App/>);
