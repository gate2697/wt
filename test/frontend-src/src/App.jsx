import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Ban, CheckCircle2, Clock, ExternalLink, KeyRound, LayoutDashboard, LogIn, LogOut, Radio, RefreshCw, Save, Search, Shield, Trash2, UserRound, Users } from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_BASE || '';
const SERVER_ID = '1495608662025048125';
const DEFAULT_REASONS = ['Random killing', 'Disobeying staff', 'RDM', 'Spawn camping', 'Harassment', 'Exploiting', 'Evading punishment'];

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text }; }
  if (!res.ok) throw new Error(json.error || json.message || `Request failed (${res.status})`);
  return json;
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
  return '';
}
function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}
function loadSavedReasons() {
  try {
    const parsed = JSON.parse(getCookie('cb_custom_ban_reasons') || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch { return []; }
}
function saveReasons(reasons) {
  setCookie('cb_custom_ban_reasons', JSON.stringify([...new Set(reasons.map((r) => r.trim()).filter(Boolean))]));
}
function formatDate(value) {
  if (!value) return 'Never';
  const d = new Date(value);
  return Number.isNaN(d.valueOf()) ? value : d.toLocaleString();
}

function Card({ title, icon, children, className = '', kicker }) {
  return <section className={`card ${className}`}>
    <div className="cardTitle"><div>{icon}<div><p>{kicker}</p><h2>{title}</h2></div></div></div>
    {children}
  </section>;
}
function Stat({ icon, label, value }) {
  return <div className="stat">{icon}<div><b>{value}</b><span>{label}</span></div></div>;
}
function Notice({ children, type = 'info' }) { return <div className={`notice ${type}`}>{children}</div>; }

function Login({ user, refresh }) {
  const [busy, setBusy] = useState(false);
  if (user) return <div className="loginBox">
    <div className="avatar"><UserRound size={18}/></div>
    <div><span>Signed in</span><b>{user.username}</b></div>
    <button className="ghost" disabled={busy} onClick={async()=>{setBusy(true); await api('/auth/logout',{method:'POST'}); setBusy(false); refresh();}}><LogOut size={16}/>Logout</button>
  </div>;
  return <a className="loginButton" href={`${API}/auth/discord`}><LogIn size={18}/>Login with Discord</a>;
}

function ReasonPicker({ value, onChange }) {
  const [customReasons, setCustomReasons] = useState(loadSavedReasons);
  const [newReason, setNewReason] = useState('');
  const reasons = useMemo(() => [...new Set([...DEFAULT_REASONS, ...customReasons])], [customReasons]);
  function addReason() {
    const clean = newReason.trim();
    if (!clean) return;
    const next = [...new Set([...customReasons, clean])];
    setCustomReasons(next); saveReasons(next); setNewReason(''); onChange(clean);
  }
  function removeReason(reason) {
    const next = customReasons.filter((r) => r !== reason);
    setCustomReasons(next); saveReasons(next); if (value === reason) onChange('');
  }
  return <div className="reasonBox">
    <label>Ban reason</label>
    <select value={reasons.includes(value) ? value : ''} onChange={(e)=>onChange(e.target.value)}>
      <option value="">Select a quick reason...</option>
      {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
    <textarea placeholder="Add details for staff records" value={value} onChange={(e)=>onChange(e.target.value)} required />
    <div className="inline">
      <input placeholder="Save a new quick reason" value={newReason} onChange={(e)=>setNewReason(e.target.value)} />
      <button type="button" className="secondary" onClick={addReason}><Save size={16}/>Save</button>
    </div>
    {customReasons.length > 0 && <div className="chips">{customReasons.map((r) => <span className="chip" key={r}>{r}<button type="button" onClick={()=>removeReason(r)}><Trash2 size={12}/></button></span>)}</div>}
  </div>;
}

function BanForm({ onCreated, selectedPlayer }) {
  const [form, setForm] = useState({ username: '', reason: '', durationHours: 24, evidenceUrl: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => { if (selectedPlayer) setForm((f) => ({ ...f, username: selectedPlayer.warthunder_username || selectedPlayer.username || '' })); }, [selectedPlayer]);
  async function submit(e) {
    e.preventDefault(); setMsg('Creating ban...');
    try {
      const body = { ...form, durationHours: Number(form.durationHours), evidenceUrl: form.evidenceUrl || undefined };
      const out = await api('/api/bans', { method: 'POST', body });
      setMsg(`Ban #${out.ban.id} created for ${out.ban.warthunder_username}`);
      setForm({ username: '', reason: '', durationHours: 24, evidenceUrl: '' }); onCreated?.();
    } catch (err) { setMsg(err.message); }
  }
  return <form onSubmit={submit} className="stack">
    {selectedPlayer && <Notice>Selected from live list: <b>{selectedPlayer.warthunder_username}</b></Notice>}
    <label>War Thunder username</label><input placeholder="Player name" value={form.username} onChange={(e)=>setForm({...form,username:e.target.value})} required />
    <ReasonPicker value={form.reason} onChange={(reason)=>setForm({...form, reason})} />
    <div className="two"><div><label>Duration</label><input type="number" min="0.1" step="0.1" value={form.durationHours} onChange={(e)=>setForm({...form,durationHours:e.target.value})} /></div><div><label>Evidence URL</label><input placeholder="Optional" value={form.evidenceUrl} onChange={(e)=>setForm({...form,evidenceUrl:e.target.value})} /></div></div>
    <button><Ban size={16}/>Ban player</button>{msg && <p className="muted">{msg}</p>}
  </form>;
}

function ActiveBans({ canMod, canHmod, refreshKey }) {
  const [bans, setBans] = useState([]); const [err, setErr] = useState(''); const [editing, setEditing] = useState({});
  const load = async () => { if (!canMod) return; try { setErr(''); setBans((await api('/api/bans/active')).bans); } catch(e){setErr(e.message);} };
  useEffect(()=>{load();},[canMod, refreshKey]);
  async function revoke(id) { const reason = prompt('Revoke reason?') || 'Revoked by staff'; await api(`/api/bans/${id}/revoke`, { method: 'POST', body: { reason } }); load(); }
  async function saveEdit(id) { const patch = editing[id]; await api(`/api/bans/${id}`, { method: 'PATCH', body: { reason: patch.reason, endsAt: patch.ends_at || null } }); setEditing((e) => ({ ...e, [id]: undefined })); load(); }
  if (!canMod) return <Notice type="warn">Login with mod permissions to see active bans.</Notice>;
  return <div className="stack"><div className="toolbar"><button className="secondary" onClick={load}><RefreshCw size={16}/>Refresh</button><span>{bans.length} active ban{bans.length === 1 ? '' : 's'}</span></div>{err && <Notice type="warn">{err}</Notice>}<div className="banList">{bans.map((b)=>{
    const edit = editing[b.id];
    return <article className="banItem" key={b.id}>
      <div><b>#{b.id} {b.warthunder_username}</b><span>{b.warthunder_id || 'No War Thunder ID yet'}</span></div>
      {edit ? <div className="stack"><textarea value={edit.reason} onChange={(e)=>setEditing({...editing,[b.id]:{...edit,reason:e.target.value}})} /><input value={edit.ends_at || ''} onChange={(e)=>setEditing({...editing,[b.id]:{...edit,ends_at:e.target.value}})} /></div> : <p>{b.reason}</p>}
      <div className="banMeta"><span><Clock size={14}/>Ends: {formatDate(b.ends_at)}</span>{b.evidence_url && <a href={b.evidence_url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Evidence</a>}</div>
      {canHmod && <div className="inline end">{edit ? <button onClick={()=>saveEdit(b.id)}>Save edit</button> : <button className="secondary" onClick={()=>setEditing({...editing,[b.id]:{ reason:b.reason, ends_at:b.ends_at || '' }})}>Edit</button>}<button className="danger" onClick={()=>revoke(b.id)}>Revoke</button></div>}
    </article>;
  })}</div></div>;
}

function PlayerList({ canMod, onPick }) {
  const [players, setPlayers] = useState([]); const [err, setErr] = useState('');
  const load = async () => { if (canMod) { try { setErr(''); setPlayers((await api('/api/bot/playerlist')).players); } catch(e){ setErr(e.message); } } };
  useEffect(()=>{load(); const t = setInterval(load, 10000); return ()=>clearInterval(t);},[canMod]);
  if (!canMod) return <aside className="rightPanel empty"><Users size={18}/><p>Live player list unlocks after mod login.</p></aside>;
  return <aside className="rightPanel"><div className="rightPanelHeader"><div><b>Live Players</b><span>{players.length} online</span></div><button className="icon" onClick={load}><RefreshCw size={14}/></button></div>{err && <p className="muted small">{err}</p>}<div className="playerMiniList">{players.map((p)=><button className="playerMini" key={p.id} onClick={()=>onPick?.(p)}><span>{p.warthunder_username}</span><small>{p.warthunder_id || 'unknown id'}</small></button>)}</div></aside>;
}

function PublicLookup() {
  const [player, setPlayer] = useState(''); const [result, setResult] = useState(null); const [err, setErr] = useState('');
  async function lookup(e){ e.preventDefault(); setErr(''); try { setResult(await api(`/api/public/bans/${encodeURIComponent(player)}`)); } catch (error) { setErr(error.message); } }
  return <form onSubmit={lookup} className="stack"><label>Check a player</label><div className="searchLine"><input placeholder="War Thunder name or ID" value={player} onChange={(e)=>setPlayer(e.target.value)} required/><button><Search size={16}/>Search</button></div>{err && <Notice type="warn">{err}</Notice>}{result && <Notice type={result.banned ? 'warn' : 'success'}>{result.banned ? `Active ban found (${result.bans.length})` : 'No active ban found.'}</Notice>}</form>;
}

function LinkCode({ user }) {
  const [code, setCode] = useState(null); const [err, setErr] = useState('');
  async function make(){ setErr(''); try { setCode(await api('/api/link-codes', { method:'POST', body:{ serviceName:'warthunder', minutesValid:15 }})); } catch (e) { setErr(e.message); } }
  if (!user) return <Notice type="warn">Login to make a link code.</Notice>;
  return <div className="stack"><button onClick={make}><KeyRound size={16}/>Make link code</button>{err && <Notice type="warn">{err}</Notice>}{code && <div className="codeBox"><span>{code.serviceName}</span><b>{code.code}</b><small>Expires {formatDate(code.expiresAt)}</small></div>}</div>;
}

function StatusBox() {
  const [status, setStatus] = useState(null); const [err, setErr] = useState('');
  const load = async()=>{ try { setErr(''); setStatus(await api('/api/bot/cb-status')); } catch(e){ setErr(e.message); } };
  useEffect(()=>{load();},[]);
  return <div className="stack">{status ? <Notice type={status.online ? 'success' : 'warn'}>CB is <b>{status.online?'online':'offline'}</b>. {status.status?.invite_hint}</Notice> : <p>Loading...</p>}{err && <Notice type="warn">{err}</Notice>}<button className="secondary" onClick={load}><RefreshCw size={16}/>Refresh</button></div>;
}

function PanelTabs({ active, setActive, perms }) {
  const tabs = [['public', 'Public'], ['mod', 'Mod'], ['hmod', 'HMod'], ['highmod', 'High Mod'], ['link', 'Linking']];
  return <nav className="tabs">{tabs.map(([id, label]) => { const locked = (id === 'mod' && !perms.mod) || (id === 'hmod' && !perms.hmod) || (id === 'highmod' && !perms.highmod); return <button key={id} className={active === id ? 'activeTab' : ''} onClick={()=>setActive(id)}>{label}{locked ? ' 🔒' : ''}</button>; })}</nav>;
}

function App(){
  const [me,setMe]=useState(null); const [authErr, setAuthErr] = useState(''); const [activePanel, setActivePanel] = useState('mod'); const [refreshKey, setRefreshKey] = useState(0); const [selectedPlayer, setSelectedPlayer] = useState(null);
  const refresh=()=>api('/auth/me').then((x)=>{setMe(x.user); setAuthErr('');}).catch((e)=>{setMe(null); setAuthErr(e.message);});
  useEffect(()=>{refresh();},[]);
  const perms = me?.perms || {};
  return <main>
    <header className="hero"><div><p className="eyebrow">CB moderation suite</p><h1>Ban Panel</h1><p>Discord OAuth, role-gated panels, live player checks, link codes, and public ban lookup on one Plesk app.</p></div><Login user={me} refresh={refresh}/></header>
    {authErr && <Notice type="warn">Auth check failed: {authErr}</Notice>}
    <section className="stats"><Stat icon={<Shield/>} label="Discord server lock" value={SERVER_ID}/><Stat icon={<CheckCircle2/>} label="Your access" value={perms.highmod ? 'High Mod' : perms.hmod ? 'HMod' : perms.mod ? 'Mod' : me ? 'Logged in' : 'Public'}/><Stat icon={<Radio/>} label="Runtime" value="Plesk native"/></section>
    <PanelTabs active={activePanel} setActive={setActivePanel} perms={perms} />
    <div className="appShell"><div className="panelArea">
      {activePanel === 'public' && <div className="panelGrid"><Card title="Public Ban Lookup" kicker="player tools" icon={<UserRound/>}><PublicLookup/></Card><Card title="CB Status" kicker="server status" icon={<Radio/>}><StatusBox/></Card></div>}
      {activePanel === 'link' && <div className="panelGrid"><Card title="Link Code" kicker="account linking" icon={<KeyRound/>}><LinkCode user={me}/></Card><Card title="Discord Lock" kicker="security" icon={<Shield/>}><p>This build is locked to server <b>{SERVER_ID}</b>. Put role names or role IDs in <code>CB_MOD_PERMS</code>, <code>CB_HMOD_PERMS</code>, and <code>CB_HIGHMOD_PERMS</code>.</p></Card></div>}
      {activePanel === 'mod' && <div className="panelGrid"><Card title="Create Ban" kicker="mod panel" icon={<Shield/>}>{perms.mod ? <BanForm selectedPlayer={selectedPlayer} onCreated={()=>setRefreshKey((k)=>k+1)}/> : <Notice type="warn">Requires cbmodperms, cbhmodperms, highmodperms, or matching role IDs.</Notice>}</Card><Card title="Active Bans" kicker="records" icon={<Ban/>}><ActiveBans canMod={perms.mod} canHmod={perms.hmod} refreshKey={refreshKey}/></Card></div>}
      {activePanel === 'hmod' && <div className="panelGrid"><Card title="HMod Management" kicker="edit and revoke" icon={<LayoutDashboard/>}>{perms.hmod ? <ActiveBans canMod={perms.mod} canHmod={perms.hmod} refreshKey={refreshKey}/> : <Notice type="warn">Requires cbhmodperms or highmodperms.</Notice>}</Card></div>}
      {activePanel === 'highmod' && <div className="panelGrid"><Card title="High Mod Controls" kicker="admin" icon={<Shield/>}>{perms.highmod ? <ActiveBans canMod={perms.highmod} canHmod={perms.highmod} refreshKey={refreshKey}/> : <Notice type="warn">Requires highmodperms.</Notice>}</Card></div>}
    </div><PlayerList canMod={perms.mod} onPick={(p)=>{setSelectedPlayer(p); setActivePanel('mod');}} /></div>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
