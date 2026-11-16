import React, { useEffect, useState } from 'react';
import { supabase, uploadPrivateFile } from './lib/supabase';

const levels = ['Tronc Commun', '1BAC', '2BAC'];
const subjects = ['Mathématiques', 'Physique', 'Chimie'];
const explain = (error) => error?.message || 'Une erreur est survenue.';

export function AdminStudents({ setMessage, refresh }) {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newClass, setNewClass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const load = async () => {
    if (!supabase) return;
    const [{ data: studentRows, error: studentError }, { data: classRows, error: classError }, { data: memberships }] = await Promise.all([
      supabase.from('profiles').select('id,email,first_name,last_name,level,status,approved_at').eq('role', 'student').order('created_at', { ascending: false }),
      supabase.from('classes').select('id,name,level').order('name'),
      supabase.from('class_members').select('student_id,class_id,classes(name)')
    ]);
    if (studentError || classError) { setLoadError(explain(studentError || classError)); return; }
    const membershipMap = new Map((memberships || []).map((item) => [item.student_id, item.classes?.name || '—']));
    setStudents((studentRows || []).map((item) => ({ ...item, className: membershipMap.get(item.id) || '—' })));
    setClasses(classRows || []); setLoadError('');
  };
  useEffect(() => { load(); }, [refresh]);
  async function invite(event) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    const { data, error } = await supabase.functions.invoke('admin-create-student', { body: { email: form.get('email'), firstName: form.get('firstName'), lastName: form.get('lastName'), level: form.get('level'), classId: form.get('classId') || null } });
    setBusy(false);
    if (error || data?.error) { setMessage(data?.error || explain(error)); return; }
    setAdding(false); setMessage(`Invitation envoyée à ${data.email}. Le compte reste en attente de validation.`); load();
  }
  async function changeStatus(student, status) {
    const { error } = await supabase.rpc('set_student_status', { target_id: student.id, target_status: status });
    if (error) setMessage(explain(error)); else { setMessage(status === 'active' ? 'Compte élève validé.' : 'Compte élève suspendu.'); load(); }
  }
  async function createClass(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('classes').insert({ name: form.get('name'), level: form.get('level'), created_by: user.id });
    setBusy(false); if (error) setMessage(explain(error)); else { setNewClass(false); setMessage('Classe créée.'); load(); }
  }
  return <section><div className="page-title"><p className="eyebrow">VOTRE CLASSE</p><h1>Mes élèves</h1><p>Invitez vos élèves, organisez les classes et validez les accès privés.</p></div><div className="admin-toolbar"><div className="filter-heading"><strong>Comptes élèves</strong><span>{students.length} élève{students.length===1?'':'s'} · {classes.length} classe{classes.length===1?'':'s'}</span></div><button className="button secondary" onClick={()=>setNewClass(true)}>+ Nouvelle classe</button><button className="button primary" onClick={()=>setAdding(true)}>+ Inviter un élève</button></div>{loadError&&<p className="error-note">{loadError}</p>}<div className="admin-table"><div className="table-head"><span>ÉLÈVE</span><span>NIVEAU</span><span>CLASSE</span><span>STATUT</span><span>ACTION</span></div>{students.map((student)=><div className="table-row" key={student.id}><span className="student-cell"><i>{`${student.first_name?.[0]||''}${student.last_name?.[0]||''}`}</i><span>{student.first_name} {student.last_name}<small>{student.email}</small></span></span><span>{student.level||'—'}</span><span>{student.className}</span><span><em className={student.status==='active'?'status-active':student.status==='pending'?'status-pending':'status-suspended'}>{student.status==='active'?'Actif':student.status==='pending'?'En attente':'Suspendu'}</em></span><button title={student.status==='active'?'Suspendre le compte':'Valider le compte'} onClick={()=>changeStatus(student,student.status==='active'?'suspended':'active')}>{student.status==='active'?'Suspendre':'Valider'}</button></div>)}{!students.length&&<div className="empty-state">Aucun compte élève pour le moment. Invitez votre première classe.</div>}</div>
    {adding&&<div className="modal-backdrop"><section className="auth-modal wide-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={()=>setAdding(false)} aria-label="Fermer">×</button><p className="eyebrow">NOUVEAU COMPTE</p><h2>Inviter un élève</h2><p className="modal-copy">Un lien d’activation sera envoyé à son adresse e-mail. Le compte restera en attente de votre validation.</p><form onSubmit={invite}><div className="form-two"><label>Prénom<input name="firstName" required/></label><label>Nom<input name="lastName" required/></label></div><label>Adresse e-mail<input name="email" type="email" required/></label><div className="form-two"><label>Niveau<select name="level">{levels.map((level)=><option key={level}>{level}</option>)}</select></label><label>Classe<select name="classId"><option value="">Choisir plus tard</option>{classes.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select></label></div><button className="button primary full" disabled={busy}>{busy?'Envoi…':'Envoyer l’invitation'}</button></form></section></div>}
    {newClass&&<div className="modal-backdrop"><section className="auth-modal"><button className="modal-close" onClick={()=>setNewClass(false)} aria-label="Fermer">×</button><p className="eyebrow">ORGANISATION</p><h2>Créer une classe</h2><form onSubmit={createClass}><label>Nom de la classe<input name="name" required placeholder="Groupe A"/></label><label>Niveau<select name="level">{levels.map((level)=><option key={level}>{level}</option>)}</select></label><button className="button primary full" disabled={busy}>Créer la classe</button></form></section></div>}
  </section>;
}

export function LiveManager({ profile, role, joinLive, setMessage }) {
  const [sessions, setSessions] = useState([]); const [classes, setClasses] = useState([]); const [scheduling, setScheduling] = useState(false); const [error, setError] = useState('');
  const isStaff = ['teacher','admin'].includes(role);
  const load = async () => {
    if (!supabase || !profile) return;
    const [{ data, error: e }, { data: classRows }] = await Promise.all([supabase.from('live_sessions').select('id,title,description,level,subject,chapter,class_id,host_id,scheduled_at,status,room_name').in('status',['scheduled','live']).order('scheduled_at'), supabase.from('classes').select('id,name,level').order('name')]);
    if (e) setError(explain(e)); else { setSessions(data||[]); setError(''); }
    setClasses(classRows||[]);
  };
  useEffect(()=>{load();},[profile?.id]);
  async function schedule(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const { error } = await supabase.from('live_sessions').insert({ title: form.get('title'), description: form.get('description'), level: form.get('level'), subject: form.get('subject'), chapter: form.get('chapter'), class_id: form.get('classId'), host_id: profile.id, scheduled_at: new Date(form.get('scheduledAt')).toISOString() });
    if (error) { setMessage(explain(error)); return; }
    setScheduling(false); setMessage('LIVE programmé.'); load();
  }
  async function cancel(id) { const { error } = await supabase.from('live_sessions').update({status:'cancelled'}).eq('id',id); if (error) setMessage(explain(error)); else { setMessage('LIVE annulé.'); load(); } }
  async function startSession(session) {
    if (session.status !== 'live') {
      const { error } = await supabase.from('live_sessions').update({status:'live'}).eq('id',session.id);
      if (error) { setMessage(explain(error)); return; }
    }
    joinLive({...session,status:'live'}); load();
  }
  return <section><div className="page-title"><p className="eyebrow">ENSEIGNEMENT EN DIRECT</p><h1>{isStaff?'LIVE & planning':'LIVE de votre classe'}</h1><p>{isStaff?'Programmez vos séances et retrouvez vos diffusions.':'Rejoignez une séance privée programmée par votre professeur.'}</p></div>{isStaff&&<div className="live-control-card"><div><span className="live-pill"><i/> STUDIO LIVE</span><h2>La classe est prête quand vous l’êtes.</h2><p>Caméra, micro, partage d’écran et chat dans votre salle de cours privée.</p><div className="studio-features"><span>✓ Vidéo HD</span><span>✓ Partage d’écran</span><span>✓ Chat des élèves</span></div><button className="button primary start-live" onClick={()=>setScheduling(true)}>+ Programmer un LIVE</button></div><div className="studio-visual"><div className="visual-ring ring-one"/><div className="visual-ring ring-two"/><div className="visual-core">LIVE</div></div></div>}<div className="section-heading schedule-heading"><div><p className="eyebrow">À VENIR</p><h2>{sessions.length} séance{sessions.length===1?'':'s'}</h2></div></div>{error&&<p className="error-note">{error}</p>}<div className="schedule-list">{sessions.map((session)=>{const date=new Date(session.scheduled_at);return <div className="session-row" key={session.id}><div className="event-date"><strong>{date.toLocaleDateString('fr-FR',{day:'2-digit'})}</strong><small>{date.toLocaleDateString('fr-FR',{month:'short'}).toUpperCase()}</small></div><div className="event-copy"><span>{session.subject} · {session.level}</span><strong>{session.title}</strong><small>{date.toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})}{session.status==='live'?' · EN DIRECT':''}</small></div><button className="button primary" onClick={()=>isStaff?startSession(session):session.status==='live'?joinLive(session):setMessage('Cette séance n’a pas encore commencé.')}>{session.status==='live'?'Rejoindre':isStaff?'Démarrer':'À venir'}</button>{isStaff&&<button className="button secondary" onClick={()=>cancel(session.id)}>Annuler</button>}</div>})}{!sessions.length&&!error&&<div className="empty-state">Aucun LIVE programmé pour cette classe.</div>}</div>{scheduling&&<div className="modal-backdrop"><section className="auth-modal wide-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={()=>setScheduling(false)} aria-label="Fermer">×</button><p className="eyebrow">NOUVELLE SÉANCE</p><h2>Programmer un LIVE</h2><form onSubmit={schedule}><label>Titre<input name="title" required maxLength="140"/></label><label>Description<textarea name="description" rows="2"/></label><div className="form-two"><label>Niveau<select name="level">{levels.map((level)=><option key={level}>{level}</option>)}</select></label><label>Matière<select name="subject">{subjects.map((subject)=><option key={subject}>{subject}</option>)}</select></label></div><label>Chapitre<input name="chapter" required/></label><div className="form-two"><label>Classe<select name="classId" required>{classes.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select></label><label>Date et heure<input name="scheduledAt" type="datetime-local" required min={new Date().toISOString().slice(0,16)}/></label></div><button className="button primary full">Programmer</button></form></section></div>}</section>;
}

export function StudentSchedule({ profile, joinLive }) {
  const [sessions,setSessions]=useState([]);
  useEffect(()=>{if(!profile||!supabase)return;supabase.from('live_sessions').select('id,title,description,level,subject,chapter,class_id,host_id,scheduled_at,status').in('status',['scheduled','live']).order('scheduled_at').then(({data})=>setSessions(data||[]));},[profile?.id]);
  return <section><div className="page-title"><p className="eyebrow">À VENIR</p><h1>Planning des cours</h1><p>Rejoignez les séances privées de votre classe.</p></div><div className="schedule-list">{sessions.map((item)=>{const date=new Date(item.scheduled_at);return <div className="session-row" key={item.id}><div className="event-date"><strong>{date.toLocaleDateString('fr-FR',{day:'2-digit'})}</strong><small>{date.toLocaleDateString('fr-FR',{month:'short'}).toUpperCase()}</small></div><div className="event-copy"><span>{item.subject} · {item.level}</span><strong>{item.title}</strong><small>{date.toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})}</small></div><button className="button primary" disabled={item.status!=='live'} onClick={()=>joinLive(item)}>{item.status==='live'?'Rejoindre le LIVE':'À venir'}</button></div>})}{!sessions.length&&<div className="empty-state">Aucun LIVE programmé pour votre classe.</div>}</div></section>;
}

export function ResourcesManager({ profile, role, setMessage }) {
  const [items,setItems]=useState([]); const [classes,setClasses]=useState([]); const [adding,setAdding]=useState(false); const [uploadProgress,setUploadProgress]=useState(null); const staff=['teacher','admin'].includes(role);
  const load=async()=>{if(!profile||!supabase)return;const {data,error}=await supabase.from('resources').select('id,title,description,kind,level,subject,chapter,storage_path,published,created_at').order('created_at',{ascending:false});if(error)setMessage(explain(error));else setItems(data||[]);if(staff){const {data:rows}=await supabase.from('classes').select('id,name,level').order('name');setClasses(rows||[]);}};
  useEffect(()=>{load();},[profile?.id]);
  async function upload(event){event.preventDefault();const form=new FormData(event.currentTarget);const file=form.get('file');const path=`${profile.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;setUploadProgress(0);try{await uploadPrivateFile(path,file,setUploadProgress);}catch(uploadError){setUploadProgress(null);setMessage(explain(uploadError));return;}const {error}=await supabase.from('resources').insert({title:form.get('title'),description:form.get('description'),kind:form.get('kind'),level:form.get('level'),subject:form.get('subject'),chapter:form.get('chapter'),class_id:form.get('classId')||null,storage_path:path,published:true,uploaded_by:profile.id});if(error){await supabase.storage.from('private-lessons').remove([path]);setUploadProgress(null);setMessage(explain(error));return;}setUploadProgress(null);setAdding(false);setMessage('Ressource publiée.');load();}
  async function open(item){const {data,error}=await supabase.storage.from('private-lessons').createSignedUrl(item.storage_path,300);if(error)setMessage(explain(error));else window.open(data.signedUrl,'_blank','noopener,noreferrer');}
  async function remove(item){if(!window.confirm(`Supprimer « ${item.title} » ?`))return;const {error}=await supabase.from('resources').delete().eq('id',item.id);if(error){setMessage(explain(error));return;}await supabase.storage.from('private-lessons').remove([item.storage_path]);setMessage('Ressource supprimée.');load();}
  async function toggle(item){const {error}=await supabase.from('resources').update({published:!item.published}).eq('id',item.id);if(error)setMessage(explain(error));else load();}
  return <section><div className="page-title"><p className="eyebrow">VOTRE MATÉRIEL</p><h1>Ressources</h1><p>Documents PDF, exercices et corrections partagés avec vos classes.</p></div>{staff&&<div className="admin-toolbar"><div className="filter-heading"><strong>Documents de cours</strong><span>{items.length} ressource{items.length===1?'':'s'}</span></div><button className="button primary" onClick={()=>setAdding(true)}>+ Ajouter un document</button></div>}<div className="resource-list">{items.map((item)=><div className="resource-row" key={item.id}><div className="resource-file-icon">PDF</div><div className="resource-row-copy"><strong>{item.title}</strong><span>{item.kind==='pdf'?'Document PDF':item.kind==='exercise'?'Exercice':'Correction'} · {item.subject} · {item.level}{item.chapter?` · ${item.chapter}`:''}</span>{item.description&&<small>{item.description}</small>}</div><button className="button secondary" onClick={()=>open(item)}>Ouvrir</button>{staff&&<><button className="button secondary" onClick={()=>toggle(item)}>{item.published?'Dépublier':'Publier'}</button><button className="resource-delete" aria-label="Supprimer la ressource" onClick={()=>remove(item)}>×</button></>}</div>)}{!items.length&&<div className="empty-state">{profile?'Aucune ressource publiée pour le moment.':'Connectez-vous pour accéder aux documents privés.'}</div>}</div>{adding&&<div className="modal-backdrop"><section className="auth-modal wide-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={()=>uploadProgress===null&&setAdding(false)} aria-label="Fermer">×</button><p className="eyebrow">DOCUMENT PRIVÉ</p><h2>Ajouter une ressource</h2><form onSubmit={upload}><label>Fichier PDF<input name="file" type="file" accept="application/pdf" required/></label>{uploadProgress!==null&&<div className="upload-progress"><span style={{width:`${uploadProgress}%`}}/><b>{uploadProgress}%</b></div>}<label>Titre<input name="title" required/></label><label>Description<textarea name="description" rows="2"/></label><div className="form-two"><label>Type<select name="kind"><option value="pdf">Document PDF</option><option value="exercise">Exercice</option><option value="correction">Correction</option></select></label><label>Niveau<select name="level">{levels.map((level)=><option key={level}>{level}</option>)}</select></label></div><div className="form-two"><label>Matière<select name="subject">{subjects.map((subject)=><option key={subject}>{subject}</option>)}</select></label><label>Chapitre<input name="chapter"/></label></div><label>Classe (facultatif)<select name="classId"><option value="">Tous les élèves approuvés</option>{classes.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select></label><button className="button primary full" disabled={uploadProgress!==null}>{uploadProgress!==null?`Téléversement ${uploadProgress}%`:'Téléverser et publier'}</button></form></section></div>}</section>;
}
