// client/src/main.jsx
import React, { useState, useEffect, useContext, createContext } from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import 'leaflet.heat';
import './index.css';

import { dict, LANGS } from './i18n';
import {
  createIssue,
  trackIssue,
  listIssues,
  upvoteIssue,
  adminList,
  adminUpdate,
  metrics,
  login,
  analyticsSeries,
  wardStats,
  getGeoPoints,
  uploadFile
} from './api';

import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js';
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Tooltip,
  Legend
);

const LangCtx = createContext({ lang: LANGS.BN, setLang: () => { } });
const useT = () => {
  const { lang } = useContext(LangCtx);
  return (k) => dict[lang][k] || k;
};

function Header() {
  const { lang, setLang } = useContext(LangCtx);
  const t = useT();
  return (
    <div style={styles.header}>
      <div style={{ fontWeight: 'bold', fontSize: 18 }}>
        {t('appTitle')} <span style={{ fontWeight: 'normal', color: '#666' }}>— {t('tagline')}</span>
      </div>
      <div>
        <button style={lang === 'BN' ? styles.langActive : styles.lang} onClick={() => setLang(LANGS.BN)}>BN</button>
        <button style={lang === 'EN' ? styles.langActive : styles.lang} onClick={() => setLang(LANGS.EN)}>EN</button>
      </div>
    </div>
  );
}

function Nav({ page, setPage }) {
  const t = useT();
  const Btn = ({ id, label }) => (
    <button onClick={() => setPage(id)} style={page === id ? styles.navActive : styles.nav}>{label}</button>
  );
  return (
    <div style={styles.navWrap}>
      <Btn id="submit" label={t('submitIssue')} />
      <Btn id="track" label={t('trackIssue')} />
      <Btn id="priorities" label={t('priorities')} />
      <Btn id="admin" label={t('admin')} />
      <Btn id="map" label="Map" />
      <Btn id="analytics" label="Analytics" />
      <Btn id="budget" label="Budget" />
      <Btn id="scorecards" label="Scorecards" />
    </div>
  );
}

/* ============ Analytics ============ */
function AnalyticsView() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await analyticsSeries(30);
      if (r.ok) setData(r);
    })();
  }, []);

  if (!data) return <div style={styles.page}>Loading…</div>;

  const labels = data.series.map(d => d._id);
  const counts = data.series.map(d => d.count);
  const catLabels = data.categories.map(c => c._id || 'Uncategorized');
  const catCounts = data.categories.map(c => c.count);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Issues per day (last 30 days)</div>
        <Line data={{ labels, datasets: [{ label: 'Issues', data: counts }] }} />
      </div>
      <div style={styles.card}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>By category</div>
        <Doughnut data={{ labels: catLabels, datasets: [{ data: catCounts }] }} />
      </div>
    </div>
  );
}

/* ============ Budget Simulator ============ */
function BudgetSimulator() {
  const [needs, setNeeds] = useState(null);     // { Roads, Waste, Flooding, Health, Education }
  const [total, setTotal] = useState(100);
  const [plan, setPlan] = useState({ Roads: 20, Waste: 20, Flooding: 20, Health: 20, Education: 20 });

  useEffect(() => {
    (async () => {
      const r = await analyticsSeries(60);
      if (r.ok) {
        const obj = {};
        for (const c of r.categories) {
          const key = (c._id || 'General');
          obj[key] = (obj[key] || 0) + c.count;
        }
        const buckets = { Roads: 0, Waste: 0, Flooding: 0, Health: 0, Education: 0 };
        for (const [k, v] of Object.entries(obj)) {
          const key = k.toLowerCase();
          if (key.includes('road')) buckets.Roads += v;
          else if (key.includes('waste')) buckets.Waste += v;
          else if (key.includes('flood')) buckets.Flooding += v;
          else if (key.includes('health')) buckets.Health += v;
          else if (key.includes('educ')) buckets.Education += v;
        }
        const sum = Object.values(buckets).reduce((a, b) => a + b, 0);
        setNeeds(sum ? buckets : { Roads: 20, Waste: 20, Flooding: 20, Health: 20, Education: 20 });
      }
    })();
  }, []);

  const categories = ['Roads', 'Waste', 'Flooding', 'Health', 'Education'];
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  const setPlanFor = (k, val) => {
    const p = { ...plan, [k]: Number(val) };
    const s = categories.reduce((a, c) => a + (p[c] || 0), 0);
    if (s === total) return setPlan(p);
    const scale = total / (s || 1);
    const q = {};
    categories.forEach(c => q[c] = Math.round((p[c] || 0) * scale));
    const diff = total - categories.reduce((a, c) => a + q[c], 0);
    if (diff !== 0) q[categories[0]] = clamp(q[categories[0]] + diff, 0, total);
    setPlan(q);
  };

  const overall = (obj) => categories.reduce((a, c) => a + (obj[c] || 0), 0);
  const needSum = needs ? overall(needs) : 0;
  const needPct = needs ? Object.fromEntries(categories.map(c => [c, needSum ? 100 * (needs[c] || 0) / needSum : 0])) : null;
  const planPct = Object.fromEntries(categories.map(c => [c, total ? 100 * (plan[c] || 0) / total : 0]));

  const score = needPct
    ? Math.round(100 * (1 - 0.5 * categories
      .map(c => Math.abs((planPct[c] || 0) - (needPct[c] || 0)) / 100)
      .reduce((a, b) => a + b, 0)))
    : 0;

  const autoAllocate = () => {
    if (!needPct) return;
    const alloc = {};
    categories.forEach(c => alloc[c] = Math.round(total * (needPct[c] || 0) / 100));
    const diff = total - categories.reduce((a, c) => a + (alloc[c] || 0), 0);
    if (diff) alloc[categories[0]] += diff;
    setPlan(alloc);
  };

  const labels = categories;
  const planned = categories.map(c => plan[c] || 0);
  const needed = categories.map(c => Math.round(total * ((needPct?.[c] || 0) / 100)));

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Participatory Budget Simulator</div>
          <div>Alignment Score: <b>{score}</b>/100</div>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label>Total Budget:
            <input
              type="number"
              style={{ ...styles.input, width: 120, marginLeft: 8 }}
              value={total}
              onChange={e => {
                const t = Math.max(10, Number(e.target.value || 0));
                setTotal(t);
                const sum = categories.reduce((a, c) => a + (plan[c] || 0), 0) || 1;
                const scale = t / sum;
                const scaled = {};
                categories.forEach(c => scaled[c] = Math.round((plan[c] || 0) * scale));
                const diff = t - categories.reduce((a, c) => a + scaled[c], 0);
                if (diff) scaled[categories[0]] += diff;
                setPlan(scaled);
              }}
            />
          </label>

          <button style={styles.btn} onClick={autoAllocate}>Auto-allocate to Needs</button>
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {categories.map(cat => (
            <div key={cat} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px', gap: 8, alignItems: 'center' }}>
              <div>{cat}</div>
              <input type="range" min="0" max={total} value={plan[cat] || 0}
                onChange={e => setPlanFor(cat, e.target.value)} />
              <div style={{ textAlign: 'right' }}>{plan[cat] || 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Planned vs Needs (normalized to total)</div>
        <Bar data={{
          labels, datasets: [
            { label: 'Planned', data: planned },
            { label: 'Needs (scaled)', data: needed }
          ]
        }} />
      </div>
    </div>
  );
}

/* ============ Map (Heat + Wards) ============ */
function MapView() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let map, wardsLayer, heatLayer;

    (async () => {
      map = L.map('v2a-map').setView([23.8103, 90.4125], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      const [statsResp, geoResp] = await Promise.all([
        wardStats(),
        fetch('/data/wards.geojson').then(r => r.json()).catch(() => null)
      ]);

      const stats = (statsResp.ok ? statsResp.stats : []) || [];
      const byWard = Object.fromEntries(stats.map(s => [s.wardCode, s]));

      const counts = stats.map(s => s.total);
      const max = counts.length ? Math.max(...counts) : 0;
      const colorFor = (v) => {
        if (!max) return '#e5e7eb';
        const t = v / max;
        if (t < 0.33) return '#86efac';
        if (t < 0.66) return '#fde047';
        return '#f87171';
      };

      if (geoResp) {
        wardsLayer = L.geoJSON(geoResp, {
          style: (feature) => {
            const code = feature.properties?.wardCode;
            const c = byWard[code]?.total || 0;
            return { color: '#111827', weight: 1, fillColor: colorFor(c), fillOpacity: 0.6 };
          },
          onEachFeature: (feature, layer) => {
            const p = feature.properties || {};
            const s = byWard[p.wardCode] || { total: 0, resolved: 0, open: 0 };
            layer.bindPopup(
              `<b>${p.name || p.wardCode || 'Ward'}</b><br/>
               Total: ${s.total}<br/>
               Resolved: ${s.resolved}<br/>
               Open: ${s.open}`
            );
          }
        }).addTo(map);

        try { map.fitBounds(wardsLayer.getBounds(), { padding: [10, 10] }); } catch { }
      }

      const geoPoints = await getGeoPoints();
      if (geoPoints.ok && geoPoints.points?.length) {
        const heatData = geoPoints.points.map(p => [p.lat, p.lng, p.weight || 1]);
        heatLayer = L.heatLayer(heatData, { radius: 25, blur: 15 }).addTo(map);
      }

      const legend = L.control({ position: 'bottomright' });
      legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        div.style.padding = '6px 8px';
        div.style.background = 'white';
        div.style.borderRadius = '8px';
        div.innerHTML = '<div style="font-weight:600;margin-bottom:4px">Issues</div>' +
          '<div><span style="display:inline-block;width:12px;height:12px;background:#86efac;margin-right:6px"></span>Low</div>' +
          '<div><span style="display:inline-block;width:12px;height:12px;background:#fde047;margin-right:6px"></span>Medium</div>' +
          '<div><span style="display:inline-block;width:12px;height:12px;background:#f87171;margin-right:6px"></span>High</div>';
        return div;
      };
      legend.addTo(map);

      setReady(true);
    })();

    return () => { if (map) map.remove(); };
  }, []);

  return (
    <div style={styles.page}>
      <div id="v2a-map" style={{ height: 500, borderRadius: 8, overflow: 'hidden', background: '#eee' }} />
      {!ready && <div style={{ marginTop: 8 }}>Loading map…</div>}
    </div>
  );
}

/* ============ Submit Issue ============ */
function SubmitIssue() {
  const t = useT();
  const [form, setForm] = useState({
    title: '', description: '', category: '', locationText: '',
    lat: '', lng: '', citizenContact: '', wardCode: ''
  });
  const [tid, setTid] = useState(null);
  const [file, setFile] = useState(null);

  // wards dropdown
  const [wards, setWards] = useState([]);
  useEffect(() => {
    fetch('/data/wards.geojson')
      .then(r => r.json())
      .then(gj => setWards(gj.features?.map(f => ({
        code: f.properties?.wardCode,
        name: f.properties?.name || f.properties?.wardCode
      })) || []))
      .catch(() => { });
  }, []);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    let images = [];
    if (file) {
      const up = await uploadFile(file);
      if (up.ok) images = [up.url];
      else alert('Image upload failed');
    }
    const payload = {
      ...form,
      lat: form.lat ? Number(form.lat) : undefined,
      lng: form.lng ? Number(form.lng) : undefined,
      images
    };
    const res = await createIssue(payload);
    if (res.ok) {
      setTid(res.trackingId);
      setForm({ title: '', description: '', category: '', locationText: '', lat: '', lng: '', citizenContact: '', wardCode: '' });
      setFile(null);
    } else {
      alert(res.error || 'Error');
    }
  };

  return (
    <div style={styles.page}>
      <form onSubmit={onSubmit} style={styles.card}>
        <input style={styles.input} name="title" placeholder={t('title')} value={form.title} onChange={onChange} required />
        <textarea style={styles.textarea} name="description" placeholder={t('description')} value={form.description} onChange={onChange} required />
        <input style={styles.input} name="category" placeholder={t('category')} value={form.category} onChange={onChange} />
        <input style={styles.input} name="locationText" placeholder={t('locationText')} value={form.locationText} onChange={onChange} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={styles.input} name="lat" placeholder={t('latitude')} value={form.lat} onChange={onChange} />
          <input style={styles.input} name="lng" placeholder={t('longitude')} value={form.lng} onChange={onChange} />
        </div>
        <input style={styles.input} name="citizenContact" placeholder={t('contact')} value={form.citizenContact} onChange={onChange} />
        <select style={styles.select} name="wardCode" value={form.wardCode} onChange={onChange}>
          <option value="">Select Ward (optional)</option>
          {wards.map(w => <option key={w.code} value={w.code}>{w.name}</option>)}
        </select>
        <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
        <button style={styles.btnPrimary}>{t('submit')}</button>
      </form>
      {tid && (
        <div style={styles.note}>
          <b>{t('trackingId')}:</b> <code>{tid}</code>
        </div>
      )}
    </div>
  );
}

/* ============ Track Issue ============ */
function TrackIssue() {
  const t = useT();
  const [tid, setTid] = useState('');
  const [res, setRes] = useState(null);

  const find = async () => {
    const r = await trackIssue(tid.trim());
    setRes(r);
  };

  return (
    <div style={styles.page}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input style={styles.input} placeholder={t('trackingId')} value={tid} onChange={e => setTid(e.target.value)} />
        <button style={styles.btnPrimary} onClick={find}>{t('find')}</button>
      </div>
      {res && res.ok && (
        <div style={styles.card}>
          <div style={{ fontWeight: 'bold', fontSize: 16 }}>{res.issue.title}</div>
          <div>{res.issue.description}</div>
          <div>{t('category')}: <b>{res.issue.category}</b></div>
          <div>{t('status')}: <StatusBadge s={res.issue.status} /></div>
        </div>
      )}
      {res && !res.ok && <div style={{ color: 'crimson' }}>Not found</div>}
    </div>
  );
}

function StatusBadge({ s }) {
  const color = {
    RECEIVED: '#eee',
    UNDER_REVIEW: '#fde68a',
    IN_PROCESS: '#bfdbfe',
    RESOLVED: '#bbf7d0'
  }[s] || '#eee';
  return <span style={{ background: color, padding: '2px 8px', borderRadius: 6 }}>{s}</span>;
}

/* ============ Priorities ============ */
function Priorities() {
  const t = useT();
  const [list, setList] = useState([]);
  const [sort, setSort] = useState('top');
  const [urgent, setUrgent] = useState(false);

  const load = async () => {
    const r = await listIssues({ sort, urgent: urgent ? 1 : 0 });
    if (r.ok) setList(r.issues);
  };
  useEffect(() => { load(); }, [sort, urgent]);


  return (
    <div style={styles.page}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button style={sort === 'top' ? styles.btnPrimary : styles.btn} onClick={() => setSort('top')}>{t('sortTop')}</button>
        <button style={sort === 'recent' ? styles.btnPrimary : styles.btn} onClick={() => setSort('recent')}>{t('sortRecent')}</button>
        <button style={urgent ? styles.btnPrimary : styles.btn} onClick={() => setUrgent(!urgent)}>
          Urgent (AI)
        </button>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {list.map(it => (
          <div key={it._id} style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 'bold' }}>{it.title}</div>
                <div style={{ color: '#666', fontSize: 12 }}>
                  #{it.trackingId} • {it.category} • {new Date(it.createdAt).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={styles.pill}>{t('status')}: {it.status}</span>
                <button
                  style={styles.btnWarn}
                  onClick={async () => {
                    const r = await upvoteIssue(it._id);
                    if (r.ok) setList(list.map(x => x._id === it._id ? { ...x, upvotes: r.upvotes } : x));
                  }}
                >
                  {t('upvote')} ({it.upvotes})
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ Admin ============ */
function Admin({ token, setToken, onLogout }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [issues, setIssues] = useState([]);
  const [stats, setStats] = useState(null);

  const load = async () => {
    const r = await adminList(token);
    if (r.ok) setIssues(r.issues); else alert(r.error || 'Unauthorized');
    const m = await metrics(); if (m.ok) setStats(m);
  };

  const save = async (id, payload) => {
    const r = await adminUpdate(token, id, payload);
    if (r.ok) setIssues(issues.map(x => x._id === id ? r.issue : x));
  };

  if (!token) {
    const doLogin = async () => {
      const r = await login(email, password);
      if (r.ok) { setToken(r.token); setEmail(''); setPassword(''); }
      else alert(r.error || 'Login failed');
    };
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, maxWidth: 420 }}>
          <input style={styles.input} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input style={styles.input} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          <button style={styles.btnPrimary} onClick={doLogin}>{t('login')}</button>
        </div>
      </div>
    );
  }

  useEffect(() => { load(); }, [token]);

  return (
    <div style={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button style={styles.btn} onClick={onLogout}>Logout</button>
      </div>
      {stats && (
        <div style={styles.card}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>{t('metrics')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, fontSize: 14 }}>
            <div>💼 {t('total')}: {stats.total}</div>
            <div>✅ {t('resolved')}: {stats.resolved}</div>
            <div>📈 {t('resolveRate')}: {stats.resolve_rate}%</div>
            <div>⏱️ {t('avgFirst')}: {stats.avg_first_response_hours}h</div>
            <div>🛠️ {t('avgResolution')}: {stats.avg_resolution_hours}h</div>
          </div>
        </div>
      )}
      <div style={styles.card}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Issues</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {issues.map(it => (
            <div key={it._id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 'bold' }}>{it.title} <span style={styles.pill}>#{it.trackingId}</span></div>
                  <div style={{ color: '#666', fontSize: 12 }}>{it.category} • {new Date(it.createdAt).toLocaleString()}</div>
                </div>
                <div style={{ fontSize: 12 }}>👍 {it.upvotes}</div>
              </div>
              <div style={{ fontSize: 14, marginTop: 6 }}>{it.description}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <select style={styles.select} value={it.status} onChange={e => save(it._id, { status: e.target.value })}>
                  <option value="RECEIVED">RECEIVED</option>
                  <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                  <option value="IN_PROCESS">IN_PROCESS</option>
                  <option value="RESOLVED">RESOLVED</option>
                </select>
                <textarea
                  style={{ ...styles.textarea, minHeight: 34 }}
                  rows={1}
                  placeholder={t('notes')}
                  value={it.adminNotes || ''}
                  onChange={e => save(it._id, { adminNotes: e.target.value })}
                />
              </div>
              {Array.isArray(it.images) && it.images.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {it.images.map((url, idx) => <img key={idx} src={url} alt="" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 6 }} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Scorecards() {
  const [orgs, setOrgs] = useState([]);
  const [sel, setSel] = useState('');
  const [m, setM] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await getOrgs();
      if (r.ok) {
        setOrgs(r.orgs || []);
        if ((r.orgs || []).length) setSel(r.orgs[0].code);
      }
    })();
  }, []);

  useEffect(() => {
    if (!sel) return;
    (async () => {
      const r = await getOrgMetrics(sel);
      if (r.ok) setM(r);
    })();
  }, [sel]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ fontWeight: 700 }}>Select LGI / Ward</div>
          <select style={styles.select} value={sel} onChange={e => setSel(e.target.value)}>
            {orgs.map(o => <option key={o.code} value={o.code}>{o.name || o.code}</option>)}
          </select>
        </div>
      </div>

      {m && (
        <div style={styles.card}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Scorecard — {m.orgCode}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8 }}>
            <div>Total: <b>{m.total}</b></div>
            <div>Resolved: <b>{m.resolved}</b></div>
            <div>Resolve Rate: <b>{m.resolve_rate}%</b></div>
            <div>Avg First Response: <b>{m.avg_first_response_hours}h</b></div>
            <div>Avg Resolution: <b>{m.avg_resolution_hours}h</b></div>
          </div>
        </div>
      )}

      {m && (
        <div style={styles.card}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Categories in {m.orgCode}</div>
          <Doughnut data={{
            labels: (m.categories || []).map(c => c._id || 'Uncategorized'),
            datasets: [{ data: (m.categories || []).map(c => c.count) }]
          }} />
        </div>
      )}
    </div>
  );
}


/* ============ App ============ */
function App() {
  const [lang, setLang] = useState(LANGS.BN);
  const [page, setPage] = useState('submit');
  const [token, setToken] = useState(localStorage.getItem('v2a_token') || '');

  const onLogout = () => { setToken(''); localStorage.removeItem('v2a_token'); };

  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <Header />
      <Nav page={page} setPage={setPage} />
      {page === 'submit' && <SubmitIssue />}
      {page === 'track' && <TrackIssue />}
      {page === 'priorities' && <Priorities />}
      {page === 'map' && <MapView />}
      {page === 'admin' && <Admin token={token} setToken={(t) => { setToken(t); localStorage.setItem('v2a_token', t); }} onLogout={onLogout} />}
      {page === 'analytics' && <AnalyticsView />}
      {page === 'budget' && <BudgetSimulator />}
      {page === 'scorecards' && <Scorecards />}
    </LangCtx.Provider>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', padding: 12, background: '#fff', borderBottom: '1px solid #eee' },
  lang: { padding: '6px 10px', marginLeft: 6, borderRadius: 6, background: '#eee', border: 'none', cursor: 'pointer' },
  langActive: { padding: '6px 10px', marginLeft: 6, borderRadius: 6, background: '#fde047', border: 'none', cursor: 'pointer' },
  navWrap: { display: 'flex', gap: 8, padding: 12, flexWrap: 'wrap' },
  nav: { padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' },
  navActive: { padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', border: '1px solid #2563eb', cursor: 'pointer' },
  page: { padding: 12, maxWidth: 900, margin: '0 auto' },
  card: { background: '#fff', padding: 12, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'grid', gap: 8 },
  input: { padding: 10, border: '1px solid #ddd', borderRadius: 8, width: '100%' },
  select: { padding: 8, border: '1px solid #ddd', borderRadius: 6 },
  textarea: { padding: 10, border: '1px solid #ddd', borderRadius: 8, width: '100%', minHeight: 80 },
  btn: { padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' },
  btnPrimary: { padding: '8px 12px', borderRadius: 8, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer' },
  btnWarn: { padding: '8px 12px', borderRadius: 8, border: '1px solid #f59e0b', background: '#f59e0b', color: '#111', cursor: 'pointer' },
  pill: { background: '#f3f4f6', padding: '2px 8px', borderRadius: 999, fontSize: 12 },
  note: { background: '#fef3c7', borderLeft: '4px solid #f59e0b', padding: 12, borderRadius: 8, marginTop: 10 }
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
