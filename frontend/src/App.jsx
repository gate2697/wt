import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Shield, User, Ban, Radio, KeyRound, RefreshCw } from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

function Card({ title, icon, children }) {
  return <section className="card"><h2>{icon}{title}</h2>{children}</section>;
}

function Login({ user, refresh }) {
  if (user) return <div className="loginBox"><span>Logged in as <b>{user.username}</b></span><button onClick={async()=>{await api('/auth/logout',{method:'POST'});refresh();}}>Logout</button></div>;
  return <a className="loginButton" href={`${API}/auth/discord`}>Login with Discord</a>;
}

function BanForm({ onCreated }) {
  const [form, setForm] = useState({ username: '', reason: '', durationHours: 24, evidenceUrl: '' });
  const [msg, setMsg] = useState('');
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
    <input placeholder="Reason" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} required />
    <input type="number" min="0.1" step="0.1" placeholder="Duration hours" value={form.durationHours} onChange={e=>setForm({...form,durationHours:e.target.value})} />
    <input placeholder="Evidence URL optional" value={form.evidenceUrl} onChange={e=>setForm({...form,evidenceUrl:e.target.value})} />
    <button><Ban size={16}/>Ban player</button><p className="muted">{msg}</p>
  </form>;
}

function ActiveBans({ canMod }) {
  const [bans, setBans] = useState([]);
  const [err, setErr] = useState('');
  const load = async () => { if (!canMod) return; try { setBans((await api('/api/bans/active')).bans); } catch(e){setErr(e.message);} };
  useEffect(()=>{load();},[canMod]);
  if (!canMod) return <p className="muted">Login with mod permissions to see active bans.</p>;
  return <div><button onClick={load}><RefreshCw size={16}/>Refresh bans</button><p className="muted">{err}</p><div className="table">{bans.map(b=><div className="row" key={b.id}><b>#{b.id} {b.warthunder_username}</b><span>{b.warthunder_id || 'no id yet'}</span><span>{b.reason}</span><span>Ends: {b.ends_at || 'never'}</span></div>)}</div></div>;
}

function PlayerList({ canMod }) {
  const [players, setPlayers] = useState([]);
  const load = async () => { if (canMod) setPlayers((await api('/api/bot/playerlist')).players); };
  useEffect(()=>{load();},[canMod]);
  if (!canMod) return null;
  return <div><button onClick={load}><RefreshCw size={16}/>Refresh playerlist</button><div className="table">{players.map(p=><div className="row" key={p.id}><b>{p.warthunder_username}</b><span>{p.warthunder_id || 'unknown id'}</span><span>{new Date(p.seen_at).toLocaleString()}</span></div>)}</div></div>;
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

function App(){
  const [me,setMe]=useState(null);
  const refresh=()=>api('/auth/me').then(x=>setMe(x.user)).catch(()=>setMe(null));
  useEffect(()=>{refresh();},[]);
  const perms = me?.perms || {};
  return <main>
    <header><div><h1>CB Ban Panel</h1><p>Discord-linked moderation, ban logs, active player checks, and public ban lookup.</p></div><Login user={me} refresh={refresh}/></header>
    <div className="grid">
      <Card title="Public Ban Lookup" icon={<User/>}><PublicLookup/></Card>
      <Card title="CB Status" icon={<Radio/>}><StatusBox/></Card>
      <Card title="Link Code" icon={<KeyRound/>}><LinkCode user={me}/></Card>
      <Card title="Mod Panel" icon={<Shield/>}>{perms.mod ? <BanForm onCreated={()=>{}}/> : <p className="muted">Requires cbmodperms, cbhmodperms, or highmodperms.</p>}</Card>
      <Card title="Active Bans" icon={<Ban/>}><ActiveBans canMod={perms.mod}/></Card>
      <Card title="Live Playerlist" icon={<Radio/>}><PlayerList canMod={perms.mod}/></Card>
      <Card title="HMod Panel" icon={<Shield/>}>{perms.hmod ? <p>HMods can edit or revoke bans through the API. Add buttons here for your workflow.</p> : <p className="muted">Requires cbhmodperms or highmodperms.</p>}</Card>
      <Card title="High Mod Panel" icon={<Shield/>}>{perms.highmod ? <p>High mods can be given config/audit/admin tools here.</p> : <p className="muted">Requires highmodperms.</p>}</Card>
    </div>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
