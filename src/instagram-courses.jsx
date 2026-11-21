import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

const levels = ['Tronc Commun', '1BAC', '2BAC'];
const subjects = ['Mathématiques', 'Physique', 'Chimie'];
const emptyForm = { title: '', url: '', description: '', level: levels[0], subject: subjects[0], chapter: '', class_id: '' };
const isStaff = (role) => role === 'teacher' || role === 'admin';

const platforms = {
  instagram: { name: 'Instagram', table: 'instagram_courses', hosts: ['instagram.com', 'instagr.am'] },
  facebook: { name: 'Facebook', table: 'facebook_courses', hosts: ['facebook.com', 'fb.watch', 'fb.me'] },
};

function safePlatformUrl(value, platform) {
  try {
    const url = new URL(value.trim());
    const hosts = platforms[platform].hosts;
    return ['http:', 'https:'].includes(url.protocol) && hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null;
  } catch { return null; }
}

export default function ExternalCourses({ platform = 'instagram', profile, role, classes = [], setMessage, openAuth }) {
  const details = platforms[platform] || platforms.instagram;
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadCourses() {
    if (!supabase || !profile) { setCourses([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from(details.table).select('id,title,url,description,level,subject,chapter,class_id,published,created_at').order('created_at', { ascending: false });
    if (error) setMessage(error.message);
    else setCourses(data || []);
    setLoading(false);
  }

  useEffect(() => { loadCourses(); }, [profile?.id, platform]);

  function beginEdit(course) {
    setEditing(course.id);
    setForm({ title: course.title, url: course.url, description: course.description || '', level: course.level, subject: course.subject, chapter: course.chapter || '', class_id: course.class_id || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() { setEditing(null); setForm(emptyForm); }

  async function saveCourse(event) {
    event.preventDefault();
    const safeUrl = safePlatformUrl(form.url, platform);
    if (!safeUrl) { setMessage(`Collez un lien valide provenant de ${details.name}.`); return; }
    setSaving(true);
    const values = { title: form.title.trim(), url: safeUrl, description: form.description.trim(), level: form.level, subject: form.subject, chapter: form.chapter.trim(), class_id: form.class_id || null, published: true };
    const result = editing
      ? await supabase.from(details.table).update(values).eq('id', editing)
      : await supabase.from(details.table).insert({ ...values, added_by: profile.id });
    setSaving(false);
    if (result.error) { setMessage(result.error.message); return; }
    setMessage(editing ? 'Cours modifié.' : 'Cours ajouté et publié.');
    resetForm();
    await loadCourses();
  }

  async function deleteCourse(course) {
    if (!window.confirm(`Supprimer « ${course.title} » ?`)) return;
    const { error } = await supabase.from(details.table).delete().eq('id', course.id);
    if (error) { setMessage(error.message); return; }
    setMessage('Cours supprimé.');
    await loadCourses();
  }

  return <section>
    <div className="page-title"><p className="eyebrow">COURS VIDÉO EXTERNES</p><h1>Cours {details.name}</h1><p>Retrouvez les liens vidéo partagés par votre professeur.</p></div>
    {!profile && <div className="resource-placeholder"><h3>Connectez-vous pour accéder aux cours</h3><p>Les liens sont réservés aux élèves dont le compte a été validé.</p><button className="button primary" onClick={openAuth}>Se connecter</button></div>}
    {profile && isStaff(role) && <form className="instagram-course-form" onSubmit={saveCourse}>
      <h2>{editing ? 'Modifier le cours' : `Ajouter un cours ${details.name}`}</h2>
      <p>Le bouton du cours ouvrira la vidéo sur {details.name}.</p>
      <label>Nom du cours<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength="140" placeholder="Ex. Exercices sur les fonctions" required/></label>
      <label>Lien {details.name}<input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder={platform === 'facebook' ? 'https://www.facebook.com/... ou https://fb.watch/...' : 'https://www.instagram.com/reel/...'} required/></label>
      <label>Description (facultatif)<textarea rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></label>
      <div className="form-two"><label>Niveau<select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value, class_id: '' })}>{levels.map((item) => <option key={item}>{item}</option>)}</select></label><label>Matière<select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>{subjects.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <div className="form-two"><label>Chapitre<input value={form.chapter} onChange={(e) => setForm({ ...form, chapter: e.target.value })} placeholder="Ex. Chapitre 2"/></label><label>Classe<select value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}><option value="">Tous les élèves approuvés</option>{classes.filter((item) => item.level === form.level).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select></label></div>
      <div className="instagram-form-actions"><button className="button primary" type="submit" disabled={saving}>{saving ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Ajouter et publier'}</button>{editing && <button className="button secondary" type="button" onClick={resetForm}>Annuler</button>}</div>
    </form>}
    {profile && <div className="instagram-course-list">
      <div className="section-heading"><div><p className="eyebrow">BIBLIOTHÈQUE</p><h2>{isStaff(role) ? 'Vos liens de cours' : 'Cours disponibles'}</h2></div><span>{courses.length} cours</span></div>
      {loading ? <div className="empty-state">Chargement des cours…</div> : courses.length === 0 ? <div className="empty-state">{isStaff(role) ? `Ajoutez votre premier lien ${details.name} avec le formulaire ci-dessus.` : `Aucun cours ${details.name} publié pour le moment.`}</div> : <div className="instagram-course-grid">{courses.map((course) => <article className="instagram-course-card" key={course.id}>
        <div className="instagram-course-meta"><span>{course.subject}</span><span>{course.level}</span>{course.chapter && <span>{course.chapter}</span>}</div>
        <h3>{course.title}</h3>
        {course.description && <p>{course.description}</p>}
        <a className="button primary" href={safePlatformUrl(course.url, platform) || '#'} target="_blank" rel="noopener noreferrer" onClick={(event) => { if (!safePlatformUrl(course.url, platform)) { event.preventDefault(); setMessage(`Ce lien ${details.name} n’est pas valide.`); } }}>Ouvrir le cours sur {details.name} ↗</a>
        {isStaff(role) && <div className="instagram-course-actions"><button onClick={() => beginEdit(course)}>Modifier</button><button onClick={() => deleteCourse(course)}>Supprimer</button></div>}
      </article>)}</div>}
      <p className="instagram-help-note">La lecture s’ouvre sur {details.name}. Selon les réglages du compte, l’élève peut devoir s’y connecter.</p>
    </div>}
  </section>;
}
