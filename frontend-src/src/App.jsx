import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Shield, User, Ban, Radio, KeyRound, RefreshCw, LayoutDashboard, Plus, Save, Trash2 } from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_BASE || ''; // empty = same Plesk domain
const SERVER_ID = '1495608662025048125';
const DEFAULT_REASONS = ['Random killing', 'Disobeying staff', 'RDM', 'Spawn camping', 'Harassment', 'Exploiting', 'Evading punishment'];

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || 'Request failed');
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
  setCookie('cb_custom_ban_reasons', JSON.stringify([...new Set(reasons.map(r => r.trim()).filter(Boolean))]));
}

function Card({ title, icon, children, className = '' }) {
  return <section className={`card ${className}`}><h2>{icon}{title}</h2>{children}</section>;
}

function Login({ user, refresh }) {
  if (user) return <div className="loginBox"><span>Logged in as <b>{user.username}</b></span><button onClick={async()=>{await api('/auth/logout',{method:'POST'});refresh();}}>Logout</button></div>;
  return <a className="loginButton" href={`${API}/auth/discord`}>Login with Discord</a>;
}

function ReasonPicker({ value, onChange }) {
  const [customReasons, setCustomReasons] = useState(loadSavedReasons);
  const [newReason, setNewReason] = useState('');
  const reasons = useMemo(() => [...new Set([...DEFAULT_REASONS, ...customReasons])], [customReasons]);

  function addReason() {
    const clean = newReason.trim();
    if (!clean) return;
    const next = [...new Set([...customReasons, clean])];
    setCustomReasons(next);
    saveReasons(next);
    setNewReason('');
    onChange(clean);
  }

  function removeReason(reason) {
    const next = customReasons.filter((r) => r !== reason);
    setCustomReasons(next);
    saveReasons(next);
    if (value === reason) onChange('');
  }

  return <div className="reasonBox">
    <label>Premade ban reason</label>
    <select value={reasons.includes(value) ? value : ''} onChange={e=>onChange(e.target.value)}>
      <option value="">Select a premade reason...</option>
      {reasons.map(r => <option key={r} value={r}>{r}</option>)}
    </select>
    <textarea placeholder="Ban reason / details" value={value} onChange={e=>onChange(e.target.value)} required />
    <div className="inline">
      <input placeholder="Save custom reason to cookies" value={newReason} onChange={e=>setNewReason(e.target.value)} />
      <button type="button" onClick={addReason}><Save size={16}/>Save</button>
    </div>
    {customReasons.length > 0 && <div className="chips">
      {customReasons.map(r => <span className="chip" key={r}>{r}<button type="button" title="Remove saved reason" onClick={()=>removeReason(r)}><Trash2 size={12}/></button></span>)}
    </div>}
  </div>;
}

function BanForm({ onCreated, selectedPlayer }) {
  const [form, setForm] = useState({ username: '', reason: '', durationHours: 24, evidenceUrl: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => { if (selectedPlayer) setForm(f => ({ ...f, username: selectedPlayer.warthunder_username || selectedPlayer.username || '' })); }, [selectedPlayer]);
  async function submit(e) {
    e.preventDefault(); setMsg('Creating ban...');
    try {
      const body = { ...form, durationHours: Number(form.durationHours), evidenceUrl: form.evidenceUrl || undefined };
      const out = await api('/api/bans', { method: 'POST', body });
      setMsg(`Ban #${out.ban.id} created for ${out.ban.warthunder_username}`);
      setForm({ username: '', reason: '', durationHours: 24, evidenceUrl: '' });
      onCreated?.();
    } catch (err) { setMsg(err.message); }
  }
  return <form onSubmit={submit} className="stack">
    <input placeholder="War Thunder username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} required />
    <ReasonPicker value={form.reason} onChange={(reason)=>setForm({...form, reason})} />
    <input type="number" min="0.1" step="0.1" placeholder="Duration hours" value={form.durationHours} onChange={e=>setForm({...form,durationHours:e.target.value})} />
    <input placeholder="Evidence URL optional" value={form.evidenceUrl} onChange={e=>setForm({...form,evidenceUrl:e.target.value})} />
    <button><Ban size={16}/>Ban player</button><p className="muted">{msg}</p>
  </form>;
}

function ActiveBans({ canMod, canHmod, refreshKey }) {
  const [bans, setBans] = useState([]);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState({});
  const load = async () => { if (!canMod) return; try { setErr(''); setBans((await api('/api/bans/active')).bans); } catch(e){setErr(e.message);} };
  useEffect(()=>{load();},[canMod, refreshKey]);
  async function revoke(id) {
    const reason = prompt('Revoke reason?') || 'Revoked by staff';
    await api(`/api/bans/${id}/revoke`, { method: 'POST', body: { reason } });
    load();
  }
  async function saveEdit(id) {
    const patch = editing[id];
    await api(`/api/bans/${id}`, { method: 'PATCH', body: { reason: patch.reason, endsAt: patch.ends_at || null } });
    setEditing(e => ({ ...e, [id]: undefined }));
    load();
  }
  if (!canMod) return <p className="muted">Login with mod permissions to see active bans.</p>;
  return <div><button onClick={load}><RefreshCw size={16}/>Refresh bans</button><p className="muted">{err}</p><div className="table bansTable">{bans.map(b=>{
    const edit = editing[b.id];
    return <div className="row" key={b.id}>
      <b>#{b.id} {b.warthunder_username}</b><span>{b.warthunder_id || 'no id yet'}</span>
      {edit ? <><textarea value={edit.reason} onChange={e=>setEditing({...editing,[b.id]:{...edit,reason:e.target.value}})} /><input value={edit.ends_at || ''} onChange={e=>setEditing({...editing,[b.id]:{...edit,ends_at:e.target.value}})} /></> : <><span>{b.reason}</span><span>Ends: {b.ends_at || 'never'}</span></>}
      {canHmod && <div className="inline rowActions">{edit ? <button onClick={()=>saveEdit(b.id)}>Save edit</button> : <button onClick={()=>setEditing({...editing,[b.id]:{ reason:b.reason, ends_at:b.ends_at || '' }})}>Edit</button>}<button onClick={()=>revoke(b.id)}>Revoke</button></div>}
    </div>;
  })}</div></div>;
}

function PlayerList({ canMod, onPick }) {
  const [players, setPlayers] = useState([]);
  const [err, setErr] = useState('');
  const load = async () => { if (canMod) { try { setErr(''); setPlayers((await api('/api/bot/playerlist')).players); } catch(e){ setErr(e.message); } } };
  useEffect(()=>{load(); const t = setInterval(load, 10000); return ()=>clearInterval(t);},[canMod]);
  if (!canMod) return <div className="rightPanelEmpty">Login with mod permissions to see players.</div>;
  return <aside className="rightPlayerPanel"><div className="rightPanelHeader"><b>Live Players</b><button onClick={load}><RefreshCw size={14}/></button></div><p className="muted small">Auto-refreshes every 10s</p><p className="muted small">{err}</p><div className="playerMiniList">{players.map(p=><button className="playerMini" key={p.id} onClick={()=>onPick?.(p)}><span>{p.warthunder_username}</span><small>{p.warthunder_id || 'unknown id'}</small></button>)}</div></aside>;
}

function PublicLookup() {
  const [player, setPlayer] = useState(''); const [result, setResult] = useState(null);
  async function lookup(e){ e.preventDefault(); setResult(await api(`/api/public/bans/${encodeURIComponent(player)}`)); }
  return <form onSubmit={lookup} className="stack"><input placeholder="Your War Thunder name or ID" value={player} onChange={e=>setPlayer(e.target.value)} required/><button>Check ban status</button>{result && <pre>{JSON.stringify(result,null,2)}</pre>}</form>;
}

function LinkCode({ user }) {
  const [code, setCode] = useState(null);
  async function make(){ setCode(await api('/api/link-codes', { method:'POST', body:{ serviceName:'warthunder-bot', minutesValid:15 }})); }
  if (!user) return <p className="muted">Login to make a link code.</p>;
  return <div><button onClick={make}><KeyRound size={16}/>Make link code</button>{code && <p className="bigCode">{code.code}</p>}</div>;
}

function StatusBox() {
  const [status, setStatus] = useState(null);
  const load = async()=>setStatus(await api('/api/bot/cb-status'));
  useEffect(()=>{load();},[]);
  return <div>{status ? <p>CB is <b className={status.online?'online':'offline'}>{status.online?'online':'offline'}</b>. {status.status?.invite_hint}</p> : <p>Loading...</p>}<button onClick={load}><RefreshCw size={16}/>Refresh</button></div>;
}

function PanelTabs({ active, setActive, perms }) {
  const tabs = [
    ['public', 'Public'],
    ['mod', 'Mod'],
    ['hmod', 'HMod'],
    ['highmod', 'High Mod'],
    ['link', 'Linking']
  ];
  return <nav className="tabs">{tabs.map(([id, label]) => {
    const locked = (id === 'mod' && !perms.mod) || (id === 'hmod' && !perms.hmod) || (id === 'highmod' && !perms.highmod);
    return <button key={id} className={active === id ? 'activeTab' : ''} onClick={()=>setActive(id)}>{label}{locked ? ' 🔒' : ''}</button>;
  })}</nav>;
}

function App(){
  const [me,setMe]=useState(null);
  const [activePanel, setActivePanel] = useState('mod');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const refresh=()=>api('/auth/me').then(x=>setMe(x.user)).catch(()=>setMe(null));
  useEffect(()=>{refresh();},[]);
  const perms = me?.perms || {};
  return <main>
    <header><div><h1>CB Ban Panel</h1><p>Locked to Discord server <code>{SERVER_ID}</code>. Discord-linked moderation, live player checks, and public ban lookup.</p></div><Login user={me} refresh={refresh}/></header>
    <PanelTabs active={activePanel} setActive={setActivePanel} perms={perms} />
    <div className="appShell">
      <div className="panelArea">
        {activePanel === 'public' && <div className="panelGrid"><Card title="Public Ban Lookup" icon={<User/>}><PublicLookup/></Card><Card title="CB Status" icon={<Radio/>}><StatusBox/></Card></div>}
        {activePanel === 'link' && <div className="panelGrid"><Card title="Link Code" icon={<KeyRound/>}><LinkCode user={me}/></Card><Card title="Discord Server Lock" icon={<Shield/>}><p>This build is locked to server <b>{SERVER_ID}</b>. Users outside that server cannot log in while <code>DISCORD_REQUIRE_GUILD_MEMBERSHIP</code> is enabled.</p></Card></div>}
        {activePanel === 'mod' && <div className="panelGrid"><Card title="Mod Panel" icon={<Shield/>}>{perms.mod ? <BanForm selectedPlayer={selectedPlayer} onCreated={()=>setRefreshKey(k=>k+1)}/> : <p className="muted">Requires cbmodperms, cbhmodperms, or highmodperms.</p>}</Card><Card title="Active Bans" icon={<Ban/>}><ActiveBans canMod={perms.mod} canHmod={perms.hmod} refreshKey={refreshKey}/></Card></div>}
        {activePanel === 'hmod' && <div className="panelGrid"><Card title="HMod Ban Management" icon={<LayoutDashboard/>}>{perms.hmod ? <ActiveBans canMod={perms.mod} canHmod={perms.hmod} refreshKey={refreshKey}/> : <p className="muted">Requires cbhmodperms or highmodperms.</p>}</Card><Card title="HMod Tools" icon={<Shield/>}><p>HMods can edit ban reasons/end dates and revoke active bans. More HMod tools can be added here.</p></Card></div>}
        {activePanel === 'highmod' && <div className="panelGrid"><Card title="High Mod Panel" icon={<Shield/>}>{perms.highmod ? <p>High mods can be given config, audit, and admin tools here. Server lock is already set to <b>{SERVER_ID}</b>.</p> : <p className="muted">Requires highmodperms.</p>}</Card><Card title="All Ban Controls" icon={<Ban/>}><ActiveBans canMod={perms.highmod} canHmod={perms.highmod} refreshKey={refreshKey}/></Card></div>}
      </div>
      <PlayerList canMod={perms.mod} onPick={(p)=>{setSelectedPlayer(p); setActivePanel('mod');}} />
    </div>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
