import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const SK = { USERS:'dv_users', SESSION:'dv_session', DOCS:'dv_docs_', DOC:'dv_doc_' };

function hashPw(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i++) { h = ((h << 5) - h) + pw.charCodeAt(i); h |= 0; }
  return h.toString(16);
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }
function fmtDate(ts) { return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
function fileIcon(t) {
  if (!t) return '📁';
  if (t.startsWith('image/')) return '🖼️';
  if (t === 'application/pdf') return '📄';
  if (t.includes('word')) return '📝';
  if (t.includes('text')) return '📃';
  if (t.includes('sheet') || t.includes('excel')) return '📊';
  if (t.includes('presentation') || t.includes('powerpoint')) return '📑';
  return '📁';
}
function fileLabel(t) {
  if (!t) return 'File';
  if (t.startsWith('image/')) return 'Image';
  if (t === 'application/pdf') return 'PDF';
  if (t.includes('word')) return 'Word';
  if (t.includes('text')) return 'Text';
  if (t.includes('sheet') || t.includes('excel')) return 'Spreadsheet';
  return 'File';
}

// ─────────────────────────────────────────────
// STORAGE SERVICE (localStorage version — works on your PC)
// ─────────────────────────────────────────────
const db = {
  async get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  async set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  async del(k) { try { localStorage.removeItem(k); return true; } catch { return false; } }
};

// ─────────────────────────────────────────────
// AI SERVICE
// ─────────────────────────────────────────────
async function callAI(prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "YOUR_API_KEY_HERE",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

async function summarizeDoc(content, name) {
  const text = (typeof content === 'string' && !content.startsWith('data:')) ? content.substring(0, 3000) : '[Binary/non-text file]';
  const raw = await callAI(`Analyze this document and respond ONLY with valid JSON (no markdown, no backticks):
{"summary":"2-3 sentence summary","topics":["topic1","topic2","topic3"],"category":"document category","entities":["entity1","entity2"],"sentiment":"Positive/Neutral/Negative","wordCount":${text.split(' ').length},"language":"detected language"}

Document: ${name}
Content: ${text}`);
  try { return JSON.parse(raw.replace(/```json|```/g,'').trim()); }
  catch { return { summary: raw, topics: [], category: 'Unknown', entities: [], sentiment: 'Neutral', wordCount: 0, language: 'Unknown' }; }
}

async function extractDoc(content, name) {
  const text = (typeof content === 'string' && !content.startsWith('data:')) ? content.substring(0, 3000) : '[Binary/non-text file]';
  return callAI(`Extract ALL key information from this document in a structured way. Include:
- Important facts and data points
- Action items or decisions
- Dates, deadlines, or schedules
- People, organizations, places mentioned
- Any numbers, statistics, or metrics
- Conclusions or recommendations

Document: ${name}
Content: ${text}`);
}

// ─────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────
const C = {
  bg: '#050d1a', card: '#0a1428', border: 'rgba(79,195,247,0.12)',
  borderHover: 'rgba(79,195,247,0.3)', accent: '#4fc3f7',
  accentGlow: 'rgba(79,195,247,0.15)', text: '#e0f0ff',
  muted: 'rgba(255,255,255,0.35)', grad: 'linear-gradient(135deg,#1565c0,#0288d1)',
  danger: 'rgba(239,68,68,0.7)', dangerBg: 'rgba(239,68,68,0.08)',
  success: 'rgba(34,197,94,0.8)', successBg: 'rgba(34,197,94,0.08)',
  gridBg: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M40 0H0M0 40V0' stroke='rgba(79,195,247,0.03)' stroke-width='1'/%3E%3C/svg%3E")`
};
const inp = { width:'100%', background:'rgba(79,195,247,0.04)', border:`1px solid ${C.border}`, borderRadius:'8px', padding:'10px 14px', color:C.text, fontSize:'14px', outline:'none', boxSizing:'border-box', fontFamily:'inherit' };
const btn = (variant='primary') => ({
  border:'none', borderRadius:'8px', padding:'9px 18px', fontSize:'13px', fontWeight:'600',
  cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
  ...(variant==='primary' ? { background:C.grad, color:'white' }
    : variant==='ghost' ? { background:'transparent', border:`1px solid ${C.border}`, color:C.muted }
    : variant==='danger' ? { background:C.dangerBg, border:`1px solid rgba(239,68,68,0.2)`, color:C.danger }
    : { background:C.accentGlow, border:`1px solid rgba(79,195,247,0.25)`, color:C.accent })
});

// ─────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('boot');
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      const s = await db.get(SK.SESSION);
      if (s) { setUser(s); setScreen('app'); } else { setScreen('login'); }
    })();
  }, []);

  async function logout() {
    await db.del(SK.SESSION);
    setUser(null); setScreen('login');
  }

  if (screen === 'boot') return (
    <div style={{background:C.bg, height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:C.accent, fontFamily:'"DM Sans",sans-serif'}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'48px', marginBottom:'16px', animation:'pulse 1.2s ease-in-out infinite'}}>🗄️</div>
        <div style={{fontSize:'16px', letterSpacing:'3px', textTransform:'uppercase', opacity:0.7}}>Initializing DocuVault</div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <style>{`
        * { box-sizing:border-box; }
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(79,195,247,0.15);border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:rgba(79,195,247,0.3)}
        input::placeholder{color:rgba(255,255,255,0.2)}
        input:focus{border-color:rgba(79,195,247,0.4)!important;box-shadow:0 0 0 3px rgba(79,195,247,0.06)}
      `}</style>
      {(screen === 'login' || screen === 'register')
        ? <AuthScreen mode={screen} onSwitch={() => setScreen(screen==='login'?'register':'login')}
            onSuccess={u => { setUser(u); setScreen('app'); }}/>
        : <MainApp user={user} onLogout={logout}/>
      }
    </>
  );
}

// ─────────────────────────────────────────────
// AUTH SCREEN (with OTP verification)
// ─────────────────────────────────────────────
function AuthScreen({ mode, onSwitch, onSuccess }) {
  const [form, setForm] = useState({ username:'', email:'', password:'' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const [showOTP, setShowOTP] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [otpErr, setOtpErr] = useState('');

  const set = k => e => setForm(p => ({...p, [k]: e.target.value}));

  async function submit() {
    setErr(''); setLoading(true);
    const users = (await db.get(SK.USERS)) || [];
    try {
      if (mode === 'register') {
        if (!form.username || !form.email || !form.password) throw new Error('All fields are required');
        if (form.password.length < 6) throw new Error('Password must be at least 6 characters');
        if (users.find(u => u.username === form.username)) throw new Error('Username already taken');

        const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
        setPendingUser({
          username: form.username,
          email: form.email,
          password: form.password,
          otp: generatedOTP,
          expiry: Date.now() + 5 * 60 * 1000
        });
        setShowOTP(true);
        setLoading(false);
        return;
      } else {
        const u = users.find(x => x.username === form.username && x.password === hashPw(form.password));
        if (!u) throw new Error('Invalid username or password');
        await db.set(SK.SESSION, u);
        onSuccess(u);
      }
    } catch(e) { setErr(e.message); }
    setLoading(false);
  }

  async function verifyOTP() {
    setOtpErr('');
    if (!pendingUser) { setOtpErr('Something went wrong. Please register again.'); return; }
    if (Date.now() > pendingUser.expiry) { setOtpErr('This code has expired. Please register again.'); return; }
    if (otpInput.trim() !== pendingUser.otp) { setOtpErr('Incorrect code. Please check and try again.'); return; }

    const users = (await db.get(SK.USERS)) || [];
    const u = {
      id: genId(),
      username: pendingUser.username,
      email: pendingUser.email,
      password: hashPw(pendingUser.password),
      createdAt: Date.now(),
      role: 'user'
    };
    await db.set(SK.USERS, [...users, u]);
    await db.set(SK.SESSION, u);
    onSuccess(u);
  }

  function resendOTP() {
    if (!pendingUser) return;
    const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    setPendingUser({ ...pendingUser, otp: generatedOTP, expiry: Date.now() + 5 * 60 * 1000 });
    setOtpErr('');
    setOtpInput('');
  }

  if (showOTP) {
    return (
      <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"DM Sans",sans-serif', position:'relative', overflow:'hidden' }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
        <div style={{position:'absolute',inset:0,backgroundImage:C.gridBg,backgroundSize:'40px 40px'}}/>
        <div style={{position:'absolute',top:'15%',left:'50%',transform:'translateX(-50%)',width:'700px',height:'500px',background:'radial-gradient(ellipse,rgba(79,195,247,0.07) 0%,transparent 70%)',pointerEvents:'none'}}/>

        <div style={{ width:'440px', background:'rgba(8,16,32,0.92)', border:`1px solid ${C.border}`, borderRadius:'20px', padding:'44px 40px', backdropFilter:'blur(24px)', boxShadow:'0 0 80px rgba(0,0,0,0.6)', position:'relative', zIndex:1, textAlign:'center', animation:'fadeIn 0.4s ease' }}>
          <div style={{fontSize:'44px', marginBottom:'14px'}}>📧</div>
          <div style={{fontSize:'21px', fontWeight:'800', color:C.text, marginBottom:'8px'}}>Verify Your Email</div>
          <div style={{fontSize:'13px', color:C.muted, marginBottom:'22px', lineHeight:'1.6'}}>
            We've sent a 6-digit verification code to<br/>
            <strong style={{color:C.accent}}>{pendingUser?.email}</strong>
          </div>

          <div style={{background:C.accentGlow, border:'1px solid rgba(79,195,247,0.25)', borderRadius:'8px', padding:'12px', marginBottom:'22px', fontSize:'12px', color:C.accent}}>
            📌 Demo Mode — Your OTP code is: <strong style={{fontSize:'18px', letterSpacing:'2px'}}>{pendingUser?.otp}</strong>
          </div>

          {otpErr && <div style={{background:C.dangerBg, border:'1px solid rgba(239,68,68,0.25)', borderRadius:'8px', padding:'10px 14px', color:'#fca5a5', fontSize:'13px', marginBottom:'16px'}}>⚠️ {otpErr}</div>}

          <input
            value={otpInput}
            onChange={e => setOtpInput(e.target.value.replace(/\D/g,'').slice(0,6))}
            maxLength={6}
            style={{...inp, textAlign:'center', fontSize:'26px', letterSpacing:'10px', marginBottom:'20px', padding:'14px'}}
            placeholder="000000"
            onKeyDown={e => e.key === 'Enter' && verifyOTP()}
          />

          <button onClick={verifyOTP} style={{...btn('primary'), width:'100%', padding:'12px', fontSize:'15px'}}>
            Verify & Create Account →
          </button>

          <div style={{display:'flex', justifyContent:'space-between', marginTop:'18px', fontSize:'12px'}}>
            <span onClick={() => { setShowOTP(false); setPendingUser(null); setOtpInput(''); setOtpErr(''); }}
              style={{color:C.muted, cursor:'pointer', textDecoration:'underline'}}>
              ← Back
            </span>
            <span onClick={resendOTP} style={{color:C.accent, cursor:'pointer', fontWeight:'600', textDecoration:'underline'}}>
              Resend Code
            </span>
          </div>

          <div style={{fontSize:'11px', color:'rgba(255,255,255,0.25)', marginTop:'18px'}}>
            This code expires in 5 minutes
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'"DM Sans",sans-serif', position:'relative', overflow:'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
      <div style={{position:'absolute',inset:0,backgroundImage:C.gridBg,backgroundSize:'40px 40px'}}/>
      <div style={{position:'absolute',top:'15%',left:'50%',transform:'translateX(-50%)',width:'700px',height:'500px',background:'radial-gradient(ellipse,rgba(79,195,247,0.07) 0%,transparent 70%)',pointerEvents:'none'}}/>
      <div style={{position:'absolute',bottom:'10%',right:'10%',width:'300px',height:'300px',background:'radial-gradient(circle,rgba(21,101,192,0.1) 0%,transparent 70%)',pointerEvents:'none'}}/>

      <div style={{ width:'440px', background:'rgba(8,16,32,0.92)', border:`1px solid ${C.border}`, borderRadius:'20px', padding:'44px 40px', backdropFilter:'blur(24px)', boxShadow:'0 0 80px rgba(0,0,0,0.6)', position:'relative', zIndex:1, animation:'fadeIn 0.4s ease' }}>
        <div style={{textAlign:'center', marginBottom:'36px'}}>
          <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'60px',height:'60px',background:'linear-gradient(135deg,rgba(21,101,192,0.3),rgba(2,136,209,0.3))',border:'1px solid rgba(79,195,247,0.25)',borderRadius:'16px',fontSize:'30px',marginBottom:'14px'}}>🗄️</div>
          <div style={{fontSize:'26px',fontWeight:'800',color:C.text,letterSpacing:'-0.5px'}}>DocuVault</div>
          <div style={{fontSize:'11px',color:'rgba(79,195,247,0.6)',marginTop:'5px',letterSpacing:'2.5px',textTransform:'uppercase'}}>Cloud Document Management</div>
        </div>

        <div style={{fontSize:'17px',fontWeight:'700',color:C.text,marginBottom:'24px'}}>
          {mode==='login' ? '👋 Welcome back' : '🚀 Create your account'}
        </div>

        {err && <div style={{background:C.dangerBg,border:'1px solid rgba(239,68,68,0.25)',borderRadius:'8px',padding:'10px 14px',color:'#fca5a5',fontSize:'13px',marginBottom:'16px',display:'flex',gap:'8px',alignItems:'center'}}>⚠️ {err}</div>}

        {mode==='register' && (
          <label style={{display:'block',marginBottom:'14px'}}>
            <span style={{display:'block',fontSize:'11px',color:'rgba(79,195,247,0.7)',marginBottom:'6px',letterSpacing:'1.5px',textTransform:'uppercase',fontWeight:'600'}}>Email Address</span>
            <input value={form.email} onChange={set('email')} style={inp} placeholder="you@example.com" type="email"/>
          </label>
        )}
        <label style={{display:'block',marginBottom:'14px'}}>
          <span style={{display:'block',fontSize:'11px',color:'rgba(79,195,247,0.7)',marginBottom:'6px',letterSpacing:'1.5px',textTransform:'uppercase',fontWeight:'600'}}>Username</span>
          <input value={form.username} onChange={set('username')} style={inp} placeholder="Enter your username"/>
        </label>
        <label style={{display:'block',marginBottom:'28px'}}>
          <span style={{display:'block',fontSize:'11px',color:'rgba(79,195,247,0.7)',marginBottom:'6px',letterSpacing:'1.5px',textTransform:'uppercase',fontWeight:'600'}}>Password</span>
          <input value={form.password} onChange={set('password')} style={inp} placeholder="••••••••" type="password" onKeyDown={e=>e.key==='Enter'&&submit()}/>
        </label>

        <button onClick={submit} disabled={loading}
          style={{...btn('primary'),width:'100%',padding:'12px',fontSize:'15px',opacity:loading?0.65:1}}>
          {loading ? '⏳ Please wait...' : mode==='login' ? 'Sign In →' : 'Create Account →'}
        </button>

        <div style={{textAlign:'center',marginTop:'22px',fontSize:'13px',color:C.muted}}>
          {mode==='login' ? "New to DocuVault? " : "Already registered? "}
          <span onClick={onSwitch} style={{color:C.accent,cursor:'pointer',fontWeight:'600',textDecoration:'underline',textUnderlineOffset:'3px'}}>
            {mode==='login' ? 'Create an account' : 'Sign in'}
          </span>
        </div>

        {mode==='login' && (
          <div style={{marginTop:'20px',padding:'12px',background:'rgba(79,195,247,0.04)',border:`1px solid ${C.border}`,borderRadius:'8px',fontSize:'12px',color:C.muted,textAlign:'center'}}>
            Demo: register a new account to get started
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
function MainApp({ user, onLogout }) {
  const [nav, setNav] = useState('dashboard');
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [viewDoc, setViewDoc] = useState(null);
  const [shareDoc, setShareDoc] = useState(null);

  const load = useCallback(async () => {
    const d = (await db.get(SK.DOCS + user.id)) || [];
    setDocs(d); setLoadingDocs(false);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const stats = {
    total: docs.length,
    storage: docs.reduce((s,d) => s+(d.size||0), 0),
    shared: docs.filter(d=>d.sharedWith?.length>0).length,
    recent: docs.filter(d=>Date.now()-d.updatedAt < 7*86400000).length,
  };

  const filtered = docs.filter(d => {
    const q = search.toLowerCase();
    const matchS = !q || d.name.toLowerCase().includes(q) || d.tags?.some(t=>t.toLowerCase().includes(q));
    const matchF = filterType==='all' || fileLabel(d.mimeType).toLowerCase()===filterType;
    return matchS && matchF;
  });

  const navDocs = nav==='recent' ? docs.filter(d=>Date.now()-d.updatedAt<7*86400000)
    : nav==='shared' ? docs.filter(d=>d.sharedWith?.length>0)
    : filtered;

  async function handleUpload(data) {
    const all = (await db.get(SK.DOCS+user.id)) || [];
    const doc = { id:genId(), ...data, ownerId:user.id, ownerName:user.username,
      createdAt:Date.now(), updatedAt:Date.now(), sharedWith:[],
      versions:[{v:1,content:data.content,at:Date.now(),by:user.username,note:'Initial upload'}]
    };
    const upd = [...all, doc];
    await db.set(SK.DOCS+user.id, upd);
    await db.set(SK.DOC+doc.id, doc);
    setDocs(upd); setShowUpload(false);
    setTimeout(load, 100);
  }

  async function handleDelete(id) {
    const upd = docs.filter(d=>d.id!==id);
    await db.set(SK.DOCS+user.id, upd);
    await db.del(SK.DOC+id);
    setDocs(upd);
  }

  async function handleShare(docId, target) {
    const upd = docs.map(d => d.id===docId
      ? {...d, sharedWith: d.sharedWith.includes(target) ? d.sharedWith : [...d.sharedWith, target], updatedAt:Date.now()}
      : d);
    await db.set(SK.DOCS+user.id, upd);
    const updated = upd.find(d=>d.id===docId);
    await db.set(SK.DOC+docId, updated);
    setDocs(upd);
    if (shareDoc?.id===docId) setShareDoc(updated);
  }

  async function handleDocUpdate(updated) {
    const upd = docs.map(d=>d.id===updated.id?updated:d);
    await db.set(SK.DOCS+user.id, upd);
    await db.set(SK.DOC+updated.id, updated);
    setDocs(upd);
    if (viewDoc?.id===updated.id) setViewDoc(updated);
  }

  const navItems = [
    {id:'dashboard',label:'Dashboard',icon:'▦'},
    {id:'documents',label:'All Documents',icon:'🗂️'},
    {id:'recent',label:'Recent',icon:'🕐'},
    {id:'shared',label:'Shared',icon:'🔗'},
  ];

  return (
    <div style={{display:'flex',height:'100vh',background:C.bg,fontFamily:'"DM Sans",sans-serif',color:C.text,overflow:'hidden'}}>
      <aside style={{width:'220px',background:'rgba(5,12,26,0.98)',borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0,zIndex:10}}>
        <div style={{padding:'18px 16px',borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <div style={{fontSize:'22px'}}>🗄️</div>
            <div>
              <div style={{fontSize:'15px',fontWeight:'800',color:C.text,letterSpacing:'-0.3px'}}>DocuVault</div>
              <div style={{fontSize:'9px',color:'rgba(79,195,247,0.55)',letterSpacing:'2px',textTransform:'uppercase'}}>Document System</div>
            </div>
          </div>
        </div>
        <div style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:'10px'}}>
          <div style={{width:'34px',height:'34px',borderRadius:'50%',background:C.grad,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:'800',color:'white',flexShrink:0}}>
            {user.username[0].toUpperCase()}
          </div>
          <div style={{overflow:'hidden',minWidth:0}}>
            <div style={{fontSize:'13px',fontWeight:'600',color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.username}</div>
            <div style={{fontSize:'10px',color:C.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.email}</div>
          </div>
        </div>
        <nav style={{flex:1,padding:'10px 8px'}}>
          {navItems.map(item => (
            <button key={item.id} onClick={()=>setNav(item.id)}
              style={{width:'100%',display:'flex',alignItems:'center',gap:'9px',padding:'9px 10px',borderRadius:'8px',border:'none',cursor:'pointer',background:nav===item.id?C.accentGlow:'transparent',color:nav===item.id?C.accent:C.muted,fontSize:'13px',fontWeight:nav===item.id?'600':'400',textAlign:'left',marginBottom:'2px',borderLeft:nav===item.id?`2px solid ${C.accent}`:'2px solid transparent',transition:'all 0.15s',fontFamily:'inherit'}}>
              <span>{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div style={{margin:'8px',padding:'12px',background:'rgba(79,195,247,0.03)',border:`1px solid ${C.border}`,borderRadius:'10px'}}>
          <div style={{fontSize:'10px',color:'rgba(79,195,247,0.55)',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:'8px',fontWeight:'600'}}>Storage</div>
          <div style={{fontSize:'12px',color:C.muted,marginBottom:'6px'}}>{fmtSize(stats.storage)} used</div>
          <div style={{height:'4px',background:'rgba(79,195,247,0.08)',borderRadius:'2px',overflow:'hidden'}}>
            <div style={{height:'100%',width:`${Math.min((stats.storage/10485760)*100,100)}%`,background:C.grad,borderRadius:'2px',transition:'width 0.5s ease'}}/>
          </div>
          <div style={{fontSize:'10px',color:'rgba(255,255,255,0.2)',marginTop:'5px'}}>of 10 MB quota</div>
        </div>
        <button onClick={onLogout}
          style={{margin:'4px 8px 10px',padding:'9px',border:'1px solid rgba(239,68,68,0.18)',borderRadius:'8px',background:C.dangerBg,color:C.danger,fontSize:'12px',cursor:'pointer',fontFamily:'inherit',fontWeight:'500',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
          ⏻ Sign Out
        </button>
      </aside>

      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <header style={{height:'60px',background:'rgba(5,13,26,0.97)',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:'12px',padding:'0 20px',flexShrink:0}}>
          <div style={{position:'relative',flex:1,maxWidth:'320px'}}>
            <span style={{position:'absolute',left:'11px',top:'50%',transform:'translateY(-50%)',color:C.muted,fontSize:'14px',pointerEvents:'none'}}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search documents..."
              style={{...inp,paddingLeft:'34px',height:'36px',fontSize:'13px'}}/>
          </div>
          <div style={{display:'flex',gap:'6px'}}>
            {['all','pdf','image','text','word'].map(t => (
              <button key={t} onClick={()=>setFilterType(t)}
                style={{padding:'5px 12px',borderRadius:'6px',border:`1px solid ${filterType===t?'rgba(79,195,247,0.35)':C.border}`,background:filterType===t?C.accentGlow:'transparent',color:filterType===t?C.accent:C.muted,fontSize:'11px',cursor:'pointer',fontWeight:filterType===t?'600':'400',textTransform:'capitalize',fontFamily:'inherit',transition:'all 0.15s'}}>
                {t}
              </button>
            ))}
          </div>
          <button onClick={()=>setShowUpload(true)}
            style={{...btn('primary'),display:'flex',alignItems:'center',gap:'6px',padding:'8px 18px',marginLeft:'auto',fontSize:'13px'}}>
            ＋ Upload
          </button>
        </header>

        <main style={{flex:1,overflow:'auto',padding:'22px'}}>
          {nav==='dashboard'
            ? <Dashboard stats={stats} docs={docs} onViewDoc={d=>{setViewDoc(d);setNav('_view');}} onUpload={()=>setShowUpload(true)}/>
            : <DocsView docs={navDocs} loading={loadingDocs} title={navItems.find(x=>x.id===nav)?.label||''}
                onView={d=>setViewDoc(d)} onDelete={handleDelete} onShare={d=>setShareDoc(d)} onUpload={()=>setShowUpload(true)}/>
          }
        </main>
      </div>

      {showUpload && <UploadModal onUpload={handleUpload} onClose={()=>setShowUpload(false)}/>}
      {viewDoc && (
        <DocViewer doc={viewDoc} user={user} onClose={()=>setViewDoc(null)}
          onShare={()=>{setShareDoc(viewDoc);}}
          onUpdate={handleDocUpdate}/>
      )}
      {shareDoc && (
        <ShareModal doc={shareDoc} onShare={(t)=>handleShare(shareDoc.id,t)} onClose={()=>setShareDoc(null)}/>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
function Dashboard({ stats, docs, onViewDoc, onUpload }) {
  const recent = [...docs].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,6);
  const typeBreakdown = docs.reduce((acc,d)=>{ const l=fileLabel(d.mimeType); acc[l]=(acc[l]||0)+1; return acc; },{});

  const cards = [
    {label:'Total Documents',value:stats.total,icon:'📁',color:'#1565c0'},
    {label:'Storage Used',value:fmtSize(stats.storage),icon:'💾',color:'#00838f'},
    {label:'Shared Files',value:stats.shared,icon:'🔗',color:'#6a1b9a'},
    {label:'Added This Week',value:stats.recent,icon:'📅',color:'#2e7d32'},
  ];

  return (
    <div style={{animation:'fadeIn 0.3s ease'}}>
      <div style={{marginBottom:'22px'}}>
        <h1 style={{fontSize:'22px',fontWeight:'800',color:C.text,margin:'0 0 4px'}}>Dashboard</h1>
        <p style={{fontSize:'13px',color:C.muted,margin:0}}>Overview of your document vault.</p>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'14px',marginBottom:'28px'}}>
        {cards.map((c,i) => (
          <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:'12px',padding:'18px 20px',borderTop:`3px solid ${c.color}`,transition:'transform 0.2s',cursor:'default'}}
            onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'}
            onMouseLeave={e=>e.currentTarget.style.transform='none'}>
            <div style={{fontSize:'26px',marginBottom:'10px'}}>{c.icon}</div>
            <div style={{fontSize:'24px',fontWeight:'800',color:C.text,marginBottom:'3px'}}>{c.value}</div>
            <div style={{fontSize:'11px',color:C.muted,letterSpacing:'0.3px'}}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'16px'}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:'12px',overflow:'hidden'}}>
          <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <h2 style={{fontSize:'14px',fontWeight:'700',color:C.text,margin:0}}>Recent Documents</h2>
            {docs.length===0 && <button onClick={onUpload} style={{...btn('accent'),fontSize:'11px',padding:'5px 12px'}}>Upload First</button>}
          </div>
          {recent.length===0 ? (
            <div style={{padding:'40px',textAlign:'center',color:C.muted}}>
              <div style={{fontSize:'36px',marginBottom:'10px'}}>📭</div>
              <div style={{fontSize:'13px'}}>No documents yet</div>
            </div>
          ) : (
            <div>
              {recent.map(doc => (
                <div key={doc.id} onClick={()=>onViewDoc(doc)}
                  style={{display:'flex',alignItems:'center',gap:'12px',padding:'11px 18px',borderBottom:`1px solid rgba(79,195,247,0.04)`,cursor:'pointer',transition:'background 0.15s'}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.accentGlow}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{fontSize:'22px'}}>{fileIcon(doc.mimeType)}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'13px',fontWeight:'600',color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{doc.name}</div>
                    <div style={{fontSize:'11px',color:C.muted}}>{fmtSize(doc.size)} · {fmtDate(doc.updatedAt)}</div>
                  </div>
                  {doc.sharedWith?.length>0 && <span style={{fontSize:'10px',background:'rgba(106,27,154,0.15)',border:'1px solid rgba(106,27,154,0.25)',borderRadius:'4px',padding:'2px 8px',color:'#ce93d8'}}>Shared</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:'12px',padding:'18px'}}>
          <h2 style={{fontSize:'14px',fontWeight:'700',color:C.text,margin:'0 0 16px'}}>File Types</h2>
          {Object.keys(typeBreakdown).length===0 ? (
            <div style={{textAlign:'center',padding:'30px 0',color:C.muted,fontSize:'13px'}}>No data yet</div>
          ) : (
            Object.entries(typeBreakdown).map(([type,count]) => (
              <div key={type} style={{marginBottom:'12px'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'5px'}}>
                  <span style={{fontSize:'12px',color:C.muted}}>{type}</span>
                  <span style={{fontSize:'12px',color:C.accent,fontWeight:'600'}}>{count}</span>
                </div>
                <div style={{height:'4px',background:'rgba(79,195,247,0.08)',borderRadius:'2px',overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${(count/docs.length)*100}%`,background:C.grad,borderRadius:'2px'}}/>
                </div>
              </div>
            ))
          )}
          <div style={{marginTop:'20px',paddingTop:'14px',borderTop:`1px solid ${C.border}`}}>
            <div style={{fontSize:'11px',color:C.muted,marginBottom:'6px'}}>Supported formats</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:'5px'}}>
              {['PDF','Image','Word','Text','Excel','Any'].map(f=>(
                <span key={f} style={{fontSize:'10px',background:'rgba(79,195,247,0.06)',border:`1px solid ${C.border}`,borderRadius:'4px',padding:'2px 7px',color:C.accent}}>{f}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DOCS VIEW (grid)
// ─────────────────────────────────────────────
function DocsView({ docs, loading, title, onView, onDelete, onShare, onUpload }) {
  if (loading) return <div style={{textAlign:'center',padding:'80px',color:C.muted}}>Loading...</div>;
  return (
    <div style={{animation:'fadeIn 0.3s ease'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
        <h1 style={{fontSize:'20px',fontWeight:'800',color:C.text,margin:0}}>
          {title} <span style={{fontSize:'13px',color:C.muted,fontWeight:'400'}}>({docs.length})</span>
        </h1>
      </div>
      {docs.length===0 ? (
        <div style={{textAlign:'center',padding:'80px',color:C.muted}}>
          <div style={{fontSize:'54px',marginBottom:'14px'}}>📁</div>
          <div style={{fontSize:'15px',color:'rgba(255,255,255,0.4)',marginBottom:'6px'}}>No documents found</div>
          <div style={{fontSize:'12px',marginBottom:'20px'}}>Upload documents to get started</div>
          <button onClick={onUpload} style={btn('primary')}>Upload Document</button>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))',gap:'14px'}}>
          {docs.map(doc => <DocCard key={doc.id} doc={doc} onView={onView} onDelete={onDelete} onShare={onShare}/>)}
        </div>
      )}
    </div>
  );
}

function DocCard({ doc, onView, onDelete, onShare }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{background:hover?'rgba(79,195,247,0.07)':C.card,border:`1px solid ${hover?C.borderHover:C.border}`,borderRadius:'12px',padding:'18px',cursor:'pointer',transition:'all 0.2s',transform:hover?'translateY(-2px)':'none',boxShadow:hover?'0 8px 24px rgba(0,0,0,0.3)':'none'}}>
      <div style={{fontSize:'38px',textAlign:'center',marginBottom:'12px'}}>{fileIcon(doc.mimeType)}</div>
      <div style={{fontSize:'13px',fontWeight:'600',color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:'4px'}}>{doc.name}</div>
      <div style={{fontSize:'11px',color:C.muted,marginBottom:'10px'}}>{fmtSize(doc.size)} · {fmtDate(doc.updatedAt)}</div>
      {doc.tags?.length>0 && (
        <div style={{display:'flex',flexWrap:'wrap',gap:'4px',marginBottom:'10px'}}>
          {doc.tags.slice(0,3).map((t,i)=>(
            <span key={i} style={{background:'rgba(79,195,247,0.08)',border:`1px solid ${C.border}`,borderRadius:'4px',padding:'1px 7px',fontSize:'10px',color:C.accent}}>{t}</span>
          ))}
        </div>
      )}
      <div style={{display:'flex',gap:'5px'}}>
        <button onClick={()=>onView(doc)} style={{flex:1,...btn('accent'),padding:'6px',fontSize:'11px',borderRadius:'6px'}}>View</button>
        <button onClick={e=>{e.stopPropagation();onShare(doc);}} style={{...btn('ghost'),padding:'6px 8px',fontSize:'11px',borderRadius:'6px'}}>🔗</button>
        <button onClick={e=>{e.stopPropagation();if(confirm('Delete this document?'))onDelete(doc.id);}} style={{...btn('danger'),padding:'6px 8px',fontSize:'11px',borderRadius:'6px'}}>🗑</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// UPLOAD MODAL
// ─────────────────────────────────────────────
function UploadModal({ onUpload, onClose }) {
  const [file, setFile] = useState(null);
  const [tags, setTags] = useState('');
  const [desc, setDesc] = useState('');
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const ref = useRef();

  function pick(f) { if(f) setFile(f); }

  async function submit() {
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async e => {
      const tagList = tags.split(',').map(t=>t.trim()).filter(Boolean);
      await onUpload({ name:file.name, mimeType:file.type||'application/octet-stream', size:file.size, content:e.target.result, tags:tagList, description:desc });
      setUploading(false);
    };
    if (file.type.startsWith('text/') || file.name.match(/\.(txt|md|csv|json|xml|html|css|js|py|java|c|cpp)$/i)) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  }

  return (
    <Modal onClose={onClose} title="Upload Document" width="500px">
      <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);pick(e.dataTransfer.files[0]);}}
        onClick={()=>ref.current.click()}
        style={{border:`2px dashed ${drag||file?'rgba(79,195,247,0.5)':C.border}`,borderRadius:'12px',padding:'30px',textAlign:'center',cursor:'pointer',background:drag?C.accentGlow:'transparent',marginBottom:'18px',transition:'all 0.2s'}}>
        <input ref={ref} type="file" style={{display:'none'}} onChange={e=>pick(e.target.files[0])}/>
        {file ? (
          <>
            <div style={{fontSize:'36px',marginBottom:'8px'}}>{fileIcon(file.type)}</div>
            <div style={{color:C.accent,fontSize:'14px',fontWeight:'600'}}>{file.name}</div>
            <div style={{color:C.muted,fontSize:'12px',marginTop:'4px'}}>{fmtSize(file.size)}</div>
          </>
        ) : (
          <>
            <div style={{fontSize:'36px',marginBottom:'10px'}}>📤</div>
            <div style={{color:'rgba(255,255,255,0.55)',fontSize:'14px',marginBottom:'5px'}}>Drop file here or click to browse</div>
            <div style={{color:C.muted,fontSize:'12px'}}>PDF, Images, Text, Word, Excel — any format</div>
          </>
        )}
      </div>

      <label style={{display:'block',marginBottom:'14px'}}>
        <span style={{display:'block',fontSize:'11px',color:'rgba(79,195,247,0.7)',marginBottom:'5px',letterSpacing:'1.5px',textTransform:'uppercase',fontWeight:'600'}}>Tags <span style={{color:C.muted,fontWeight:'400',letterSpacing:0}}>(comma separated, optional)</span></span>
        <input value={tags} onChange={e=>setTags(e.target.value)} style={inp} placeholder="e.g. report, finance, Q4"/>
      </label>
      <label style={{display:'block',marginBottom:'22px'}}>
        <span style={{display:'block',fontSize:'11px',color:'rgba(79,195,247,0.7)',marginBottom:'5px',letterSpacing:'1.5px',textTransform:'uppercase',fontWeight:'600'}}>Description <span style={{color:C.muted,fontWeight:'400',letterSpacing:0}}>(optional)</span></span>
        <input value={desc} onChange={e=>setDesc(e.target.value)} style={inp} placeholder="Brief description of this document"/>
      </label>

      <div style={{display:'flex',gap:'10px'}}>
        <button onClick={onClose} style={{...btn('ghost'),flex:1}}>Cancel</button>
        <button onClick={submit} disabled={!file||uploading} style={{...btn('primary'),flex:2,opacity:file&&!uploading?1:0.5}}>
          {uploading ? '⏳ Uploading...' : '⬆ Upload Document'}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// DOCUMENT VIEWER
// ─────────────────────────────────────────────
function DocViewer({ doc, user, onClose, onShare, onUpdate }) {
  const [tab, setTab] = useState('preview');
  const [aiRes, setAiRes] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiType, setAiType] = useState('');
  const [vNote, setVNote] = useState('');
  const [savingV, setSavingV] = useState(false);

  async function runAI(type) {
    setAiType(type); setAiLoading(true); setAiRes(null); setTab('ai');
    const res = type==='summarize' ? await summarizeDoc(doc.content, doc.name) : await extractDoc(doc.content, doc.name);
    setAiRes(res); setAiLoading(false);
  }

  async function saveVersion() {
    if (!vNote.trim()) return;
    setSavingV(true);
    const nv = { v:(doc.versions?.length||0)+1, content:doc.content, at:Date.now(), by:user.username, note:vNote };
    const updated = { ...doc, versions:[...(doc.versions||[]), nv], updatedAt:Date.now() };
    await onUpdate(updated);
    setVNote(''); setSavingV(false);
  }

  async function restoreVersion(vObj) {
    const updated = { ...doc, content:vObj.content, updatedAt:Date.now() };
    await onUpdate(updated);
  }

  const tabs = [
    {id:'preview',label:'Preview'},
    {id:'versions',label:`Versions (${doc.versions?.length||0})`},
    {id:'ai',label:'🤖 AI'},
    {id:'info',label:'Info'},
  ];

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,backdropFilter:'blur(8px)'}}>
      <div style={{width:'900px',height:'88vh',background:'#080f1e',border:`1px solid ${C.border}`,borderRadius:'18px',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 0 120px rgba(0,0,0,0.7)',animation:'fadeIn 0.25s ease'}}>
        <div style={{padding:'14px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:'12px',flexShrink:0}}>
          <span style={{fontSize:'26px'}}>{fileIcon(doc.mimeType)}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:'15px',fontWeight:'700',color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{doc.name}</div>
            <div style={{fontSize:'11px',color:C.muted}}>{fmtSize(doc.size)} · {fileLabel(doc.mimeType)} · Modified {fmtDate(doc.updatedAt)}</div>
          </div>
          <button onClick={()=>runAI('summarize')} style={{...btn('accent'),fontSize:'12px',padding:'6px 14px'}}>🤖 AI Analyze</button>
          <button onClick={onShare} style={{...btn('ghost'),fontSize:'12px',padding:'6px 12px'}}>🔗 Share</button>
          <button onClick={onClose} style={{background:'transparent',border:`1px solid ${C.border}`,borderRadius:'7px',padding:'6px 12px',color:C.muted,fontSize:'14px',cursor:'pointer'}}>✕</button>
        </div>

        <div style={{display:'flex',borderBottom:`1px solid rgba(79,195,247,0.07)`,padding:'0 20px',flexShrink:0}}>
          {tabs.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:'11px 18px',border:'none',background:'transparent',color:tab===t.id?C.accent:C.muted,fontSize:'13px',fontWeight:tab===t.id?'600':'400',cursor:'pointer',borderBottom:tab===t.id?`2px solid ${C.accent}`:'2px solid transparent',transition:'all 0.15s',fontFamily:'inherit',marginBottom:'-1px'}}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{flex:1,overflow:'auto',padding:'22px'}}>
          {tab==='preview' && (
            doc.mimeType?.startsWith('image/') ? (
              <div style={{textAlign:'center'}}>
                <img src={doc.content} alt={doc.name} style={{maxWidth:'100%',maxHeight:'65vh',borderRadius:'10px',boxShadow:'0 4px 24px rgba(0,0,0,0.5)'}}/>
              </div>
            ) : (typeof doc.content==='string' && !doc.content.startsWith('data:')) ? (
              <pre style={{background:'rgba(79,195,247,0.025)',border:`1px solid ${C.border}`,borderRadius:'10px',padding:'20px',color:'rgba(255,255,255,0.65)',fontSize:'13px',fontFamily:'"JetBrains Mono",monospace',lineHeight:'1.8',whiteSpace:'pre-wrap',wordBreak:'break-word',margin:0}}>
                {doc.content}
              </pre>
            ) : (
              <div style={{textAlign:'center',padding:'60px',color:C.muted}}>
                <div style={{fontSize:'64px',marginBottom:'14px'}}>{fileIcon(doc.mimeType)}</div>
                <div style={{fontSize:'16px',color:'rgba(255,255,255,0.4)',marginBottom:'8px'}}>Preview not available</div>
                <div style={{fontSize:'13px'}}>{doc.name} · {fmtSize(doc.size)}</div>
                {doc.description && <div style={{marginTop:'16px',padding:'12px',background:C.accentGlow,border:`1px solid ${C.border}`,borderRadius:'8px',fontSize:'13px',color:'rgba(255,255,255,0.6)',maxWidth:'400px',margin:'16px auto 0',lineHeight:'1.6'}}>{doc.description}</div>}
              </div>
            )
          )}

          {tab==='versions' && (
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px'}}>
                <h3 style={{color:C.text,margin:0,fontSize:'14px',fontWeight:'700'}}>Version History ({doc.versions?.length||0} versions)</h3>
              </div>
              <div style={{background:'rgba(79,195,247,0.04)',border:`1px solid ${C.border}`,borderRadius:'10px',padding:'14px',marginBottom:'18px',display:'flex',gap:'10px',alignItems:'flex-end'}}>
                <div style={{flex:1}}>
                  <label style={{display:'block',fontSize:'11px',color:'rgba(79,195,247,0.6)',marginBottom:'5px',letterSpacing:'1.5px',textTransform:'uppercase',fontWeight:'600'}}>Save Current as New Version</label>
                  <input value={vNote} onChange={e=>setVNote(e.target.value)} placeholder="Version note (e.g. 'Added introduction')" style={inp}/>
                </div>
                <button onClick={saveVersion} disabled={!vNote.trim()||savingV} style={{...btn('primary'),padding:'10px 18px',opacity:vNote.trim()&&!savingV?1:0.5,flexShrink:0}}>
                  {savingV?'Saving...':'Save Version'}
                </button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                {[...(doc.versions||[])].reverse().map((v,i) => (
                  <div key={i} style={{background:'rgba(79,195,247,0.03)',border:`1px solid ${C.border}`,borderRadius:'10px',padding:'13px 16px',display:'flex',alignItems:'center',gap:'14px'}}>
                    <div style={{width:'36px',height:'36px',borderRadius:'50%',background:i===0?C.grad:'rgba(79,195,247,0.1)',border:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:'700',color:i===0?'white':C.accent,flexShrink:0}}>v{v.v}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'13px',color:C.text,fontWeight:'500'}}>{v.note||'No note'}</div>
                      <div style={{fontSize:'11px',color:C.muted,marginTop:'2px'}}>by {v.by} · {fmtDate(v.at)}</div>
                    </div>
                    {i===0 ? <span style={{fontSize:'10px',background:C.accentGlow,border:`1px solid rgba(79,195,247,0.25)`,borderRadius:'4px',padding:'2px 8px',color:C.accent,letterSpacing:'1px',textTransform:'uppercase'}}>Latest</span>
                      : <button onClick={()=>restoreVersion(v)} style={{...btn('ghost'),fontSize:'11px',padding:'5px 12px'}}>Restore</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab==='ai' && (
            <div>
              <div style={{display:'flex',gap:'10px',marginBottom:'22px'}}>
                <button onClick={()=>runAI('summarize')} disabled={aiLoading} style={btn('primary')}>🤖 Summarize Document</button>
                <button onClick={()=>runAI('extract')} disabled={aiLoading} style={btn('accent')}>🔍 Extract Key Info</button>
              </div>

              {aiLoading && (
                <div style={{textAlign:'center',padding:'50px',color:C.accent}}>
                  <div style={{fontSize:'32px',marginBottom:'14px',display:'inline-block',animation:'spin 1.2s linear infinite'}}>⚙️</div>
                  <div style={{fontSize:'14px',opacity:0.8}}>Claude AI is analyzing your document...</div>
                </div>
              )}

              {aiRes && aiType==='summarize' && typeof aiRes==='object' && (
                <div style={{display:'flex',flexDirection:'column',gap:'14px',animation:'fadeIn 0.3s ease'}}>
                  <div style={{background:'rgba(79,195,247,0.04)',border:`1px solid ${C.border}`,borderRadius:'10px',padding:'16px'}}>
                    <div style={{fontSize:'11px',color:'rgba(79,195,247,0.6)',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:'8px',fontWeight:'600'}}>📋 Summary</div>
                    <div style={{fontSize:'14px',color:'rgba(255,255,255,0.7)',lineHeight:'1.75'}}>{aiRes.summary}</div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px'}}>
                    <div style={{background:'rgba(79,195,247,0.04)',border:`1px solid ${C.border}`,borderRadius:'10px',padding:'14px'}}>
                      <div style={{fontSize:'11px',color:'rgba(79,195,247,0.6)',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:'8px',fontWeight:'600'}}>Category</div>
                      <div style={{fontSize:'14px',color:C.text,fontWeight:'700'}}>{aiRes.category}</div>
                      <div style={{fontSize:'11px',color:C.muted,marginTop:'4px'}}>Sentiment: {aiRes.sentiment}</div>
                      <div style={{fontSize:'11px',color:C.muted,marginTop:'2px'}}>Language: {aiRes.language}</div>
                    </div>
                    <div style={{background:'rgba(79,195,247,0.04)',border:`1px solid ${C.border}`,borderRadius:'10px',padding:'14px'}}>
                      <div style={{fontSize:'11px',color:'rgba(79,195,247,0.6)',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:'8px',fontWeight:'600'}}>Entities</div>
                      {aiRes.entities?.length>0 ? aiRes.entities.slice(0,5).map((e,i)=>(
                        <div key={i} style={{fontSize:'12px',color:'rgba(255,255,255,0.6)',marginBottom:'3px'}}>• {e}</div>
                      )) : <div style={{fontSize:'12px',color:C.muted}}>None detected</div>}
                    </div>
                    <div style={{background:'rgba(79,195,247,0.04)',border:`1px solid ${C.border}`,borderRadius:'10px',padding:'14px'}}>
                      <div style={{fontSize:'11px',color:'rgba(79,195,247,0.6)',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:'8px',fontWeight:'600'}}>Stats</div>
                      <div style={{fontSize:'12px',color:'rgba(255,255,255,0.6)',marginBottom:'3px'}}>~{aiRes.wordCount} words</div>
                      <div style={{fontSize:'12px',color:'rgba(255,255,255,0.6)'}}>Sentiment: {aiRes.sentiment}</div>
                    </div>
                  </div>
                  <div style={{background:'rgba(79,195,247,0.04)',border:`1px solid ${C.border}`,borderRadius:'10px',padding:'16px'}}>
                    <div style={{fontSize:'11px',color:'rgba(79,195,247,0.6)',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:'10px',fontWeight:'600'}}>🏷️ Key Topics</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>
                      {aiRes.topics?.map((t,i)=>(
                        <span key={i} style={{background:C.accentGlow,border:`1px solid rgba(79,195,247,0.25)`,borderRadius:'6px',padding:'4px 12px',fontSize:'12px',color:C.accent}}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {aiRes && aiType==='extract' && typeof aiRes==='string' && (
                <div style={{background:'rgba(79,195,247,0.03)',border:`1px solid ${C.border}`,borderRadius:'10px',padding:'20px',animation:'fadeIn 0.3s ease'}}>
                  <pre style={{color:'rgba(255,255,255,0.7)',fontSize:'13px',lineHeight:'1.8',fontFamily:'"JetBrains Mono",monospace',whiteSpace:'pre-wrap',margin:0}}>{aiRes}</pre>
                </div>
              )}

              {!aiRes && !aiLoading && (
                <div style={{textAlign:'center',padding:'60px',color:C.muted}}>
                  <div style={{fontSize:'54px',marginBottom:'14px'}}>🤖</div>
                  <div style={{fontSize:'15px',color:'rgba(255,255,255,0.4)',marginBottom:'6px'}}>AI Document Analysis</div>
                  <div style={{fontSize:'13px'}}>Use the buttons above to analyze this document with Claude AI</div>
                </div>
              )}
            </div>
          )}

          {tab==='info' && (
            <div style={{maxWidth:'550px'}}>
              {[
                ['📄 File Name', doc.name],
                ['🗂 File Type', `${fileLabel(doc.mimeType)} (${doc.mimeType||'unknown'})`],
                ['💾 File Size', fmtSize(doc.size)],
                ['👤 Owner', doc.ownerName],
                ['📅 Created', fmtDate(doc.createdAt)],
                ['✏️ Last Modified', fmtDate(doc.updatedAt)],
                ['🔁 Versions', `${doc.versions?.length||0} version(s)`],
                ['🔗 Shared With', doc.sharedWith?.length>0 ? doc.sharedWith.join(', ') : 'Not shared'],
                ['🏷 Tags', doc.tags?.length>0 ? doc.tags.join(', ') : 'No tags'],
                ['📝 Description', doc.description || 'No description'],
              ].map(([label,value]) => (
                <div key={label} style={{display:'flex',padding:'12px 0',borderBottom:`1px solid rgba(79,195,247,0.05)`}}>
                  <div style={{width:'160px',fontSize:'12px',color:'rgba(79,195,247,0.65)',flexShrink:0,fontWeight:'600'}}>{label}</div>
                  <div style={{fontSize:'13px',color:'rgba(255,255,255,0.65)',lineHeight:'1.5'}}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SHARE MODAL
// ─────────────────────────────────────────────
function ShareModal({ doc, onShare, onClose }) {
  const [target, setTarget] = useState('');
  const [ok, setOk] = useState(false);

  async function share() {
    if (!target.trim()) return;
    await onShare(target.trim());
    setOk(true); setTarget('');
    setTimeout(()=>setOk(false), 2000);
  }

  return (
    <Modal onClose={onClose} title="Share Document" width="420px">
      <div style={{background:'rgba(79,195,247,0.04)',border:`1px solid ${C.border}`,borderRadius:'10px',padding:'14px',marginBottom:'20px',display:'flex',alignItems:'center',gap:'12px'}}>
        <span style={{fontSize:'28px'}}>{fileIcon(doc.mimeType)}</span>
        <div>
          <div style={{fontSize:'13px',fontWeight:'600',color:C.text}}>{doc.name}</div>
          <div style={{fontSize:'11px',color:C.muted}}>{fmtSize(doc.size)} · {fileLabel(doc.mimeType)}</div>
        </div>
      </div>

      {doc.sharedWith?.length>0 && (
        <div style={{marginBottom:'16px'}}>
          <div style={{fontSize:'11px',color:'rgba(79,195,247,0.6)',marginBottom:'8px',letterSpacing:'1.5px',textTransform:'uppercase',fontWeight:'600'}}>Currently shared with</div>
          {doc.sharedWith.map((e,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 0',borderBottom:`1px solid rgba(79,195,247,0.05)`}}>
              <div style={{width:'24px',height:'24px',borderRadius:'50%',background:C.grad,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:'700',color:'white'}}>{e[0]?.toUpperCase()}</div>
              <span style={{fontSize:'13px',color:'rgba(255,255,255,0.55)'}}>{e}</span>
              <span style={{marginLeft:'auto',fontSize:'10px',background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:'4px',padding:'1px 7px',color:C.success}}>View</span>
            </div>
          ))}
        </div>
      )}

      <label style={{display:'block',marginBottom:'16px'}}>
        <span style={{display:'block',fontSize:'11px',color:'rgba(79,195,247,0.7)',marginBottom:'6px',letterSpacing:'1.5px',textTransform:'uppercase',fontWeight:'600'}}>Share with (username or email)</span>
        <input value={target} onChange={e=>setTarget(e.target.value)} style={inp} placeholder="Enter username or email address" onKeyDown={e=>e.key==='Enter'&&share()}/>
      </label>

      {ok && <div style={{background:C.successBg,border:'1px solid rgba(34,197,94,0.25)',borderRadius:'8px',padding:'9px',color:C.success,fontSize:'13px',textAlign:'center',marginBottom:'14px'}}>✓ Document shared successfully!</div>}

      <div style={{display:'flex',gap:'10px'}}>
        <button onClick={onClose} style={{...btn('ghost'),flex:1}}>Close</button>
        <button onClick={share} disabled={!target.trim()} style={{...btn('primary'),flex:2,opacity:target.trim()?1:0.5}}>Share Document</button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// MODAL WRAPPER
// ─────────────────────────────────────────────
function Modal({ children, onClose, title, width='480px' }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,backdropFilter:'blur(6px)'}}>
      <div style={{width,background:'#070d1c',border:`1px solid ${C.border}`,borderRadius:'18px',padding:'28px',boxShadow:'0 0 80px rgba(0,0,0,0.6)',animation:'fadeIn 0.25s ease',maxHeight:'90vh',overflow:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'22px'}}>
          <h2 style={{color:C.text,margin:0,fontSize:'17px',fontWeight:'800'}}>{title}</h2>
          <button onClick={onClose} style={{background:'transparent',border:`1px solid ${C.border}`,borderRadius:'7px',padding:'5px 11px',color:C.muted,fontSize:'15px',cursor:'pointer'}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
