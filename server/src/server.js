// server/src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || ''
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const Issue = require('./models/Issue');
const User = require('./models/User');
const { autoCategory } = require('./utils/autoCategory');
const Sentiment = require('sentiment');
const sentiment = new Sentiment();

const Organization = require('./models/Organization'); // we'll create this next

const app = express();

/* ---------- ENV ---------- */
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/voice2action';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

/* ---------- MIDDLEWARE ---------- */
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false })); // for SMS/IVR form-encoded webhooks
app.use(morgan('dev'));

/* ---------- HELPERS ---------- */
const makeTrackingId = () =>
  crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();

function signToken(user) {
  return jwt.sign(
    { sub: user._id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireRole(...roles) {
  return (req, res, next) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'no token' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (!roles.includes(payload.role)) return res.status(403).json({ error: 'forbidden' });
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'invalid token' });
    }
  };
}

/* ---------- DB CONNECT THEN START ---------- */
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => {
      console.log(` Voice2Action API running http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

/* ---------- ROUTES ---------- */
// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/* ===== Issues (public) ===== */
// Create new issue
// Create new issue
app.post('/api/issues', async (req, res) => {
  try {
    const {
      title, description, category,
      locationText, lat, lng, citizenContact, images,
      wardCode, orgCode //accepts either or both
    } = req.body || {};

    if (!title || !description) {
      return res.status(400).json({ error: 'title and description required' });
    }

    // Category (simple auto)
    const cat = (category && category.trim())
      ? category.trim()
      : autoCategory(`${title} ${description}`);

    //  Sentiment score
    const score = sentiment.analyze(`${title} ${description}`).score;

    //  Decide orgCode (if not provided, reuse wardCode)
    const finalOrgCode = orgCode || wardCode || undefined;

    // Upsert Organization document if we have a code
    if (finalOrgCode) {
      await Organization.updateOne(
        { code: finalOrgCode },
        { $setOnInsert: { name: finalOrgCode, type: 'Other' } },
        { upsert: true }
      );
    }

    // Tracking ID
    const trackingId = makeTrackingId();

    // Create
    const doc = await Issue.create({
      trackingId,
      title,
      description,
      category: cat,
      locationText: locationText || undefined,
      lat: (lat !== '' && lat !== undefined) ? Number(lat) : undefined,
      lng: (lng !== '' && lng !== undefined) ? Number(lng) : undefined,
      citizenContact: citizenContact || undefined,
      images: Array.isArray(images) ? images : [],
      wardCode: wardCode || undefined,
      orgCode: finalOrgCode,
      sentimentScore: score
    });

    res.json({ ok: true, trackingId: doc.trackingId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});


// Track by trackingId
app.get('/api/issues/track/:trackingId', async (req, res) => {
  const { trackingId } = req.params;
  const issue = await Issue.findOne({ trackingId });
  if (!issue) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true, issue });
});

// List issues (top/recent + optional filters)
app.get('/api/issues', async (req, res) => {
  const { sort = 'recent', limit = 50, status, category, urgent, orgCode } = req.query;
  const lim = Math.min(parseInt(limit || 50), 200);

  const q = {};
  if (status) q.status = status;
  if (category) q.category = category;
  if (orgCode) q.orgCode = orgCode; //filter by org

  let sortBy;
  if (urgent === '1') {
    //most negative sentiment first
    sortBy = { sentimentScore: 1, createdAt: -1 };
  } else {
    sortBy = sort === 'top' ? { upvotes: -1, createdAt: -1 } : { createdAt: -1 };
  }

  const fields = 'title trackingId category status upvotes createdAt sentimentScore orgCode wardCode';
  const items = await Issue.find(q).sort(sortBy).limit(lim).select(fields).lean();

  res.json({ ok: true, issues: items });
});


// Upvote
app.post('/api/issues/:id/upvote', async (req, res) => {
  const { id } = req.params;
  const updated = await Issue.findByIdAndUpdate(
    id,
    { $inc: { upvotes: 1 } },
    { new: true, select: 'upvotes' }
  );
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true, id, upvotes: updated.upvotes });
});

// Geo heatmap points
app.get('/api/issues/geo', async (req, res) => {
  const items = await Issue.find({ lat: { $ne: null }, lng: { $ne: null } })
    .select('lat lng upvotes')
    .lean();
  const points = items.map(i => ({ lat: i.lat, lng: i.lng, weight: 1 })); // or weight: i.upvotes
  res.json({ ok: true, points });
});

/* ===== Metrics / Analytics (public) ===== */
app.get('/api/metrics', async (req, res) => {
  const total = await Issue.countDocuments();
  const resolved = await Issue.countDocuments({ status: 'RESOLVED' });

  const firstResp = await Issue.aggregate([
    { $match: { firstResponseAt: { $ne: null } } },
    {
      $project: {
        diffHours: { $divide: [{ $subtract: ['$firstResponseAt', '$createdAt'] }, 1000 * 60 * 60] }
      }
    },
    { $group: { _id: null, avg: { $avg: '$diffHours' } } }
  ]);

  const resolution = await Issue.aggregate([
    { $match: { resolvedAt: { $ne: null } } },
    {
      $project: {
        diffHours: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 1000 * 60 * 60] }
      }
    },
    { $group: { _id: null, avg: { $avg: '$diffHours' } } }
  ]);

  res.json({
    ok: true,
    total,
    resolved,
    resolve_rate: total ? Math.round((resolved / total) * 100) : 0,
    avg_first_response_hours: firstResp[0]?.avg ? Math.round(firstResp[0].avg) : 0,
    avg_resolution_hours: resolution[0]?.avg ? Math.round(resolution[0].avg) : 0
  });
});

app.get('/api/analytics/series', async (req, res) => {
  const days = Math.min(parseInt(req.query.days || 30), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const series = await Issue.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $project: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
    { $group: { _id: '$day', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  const categories = await Issue.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  res.json({ ok: true, series, categories });
});

/* ===== Auth (public) ===== */
// Register first admin/officer (use to create your first account)
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role = 'admin' } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ error: 'email already registered' });

  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash: hash, role });

  res.json({ ok: true, user: { id: user._id, email: user.email, role: user.role } });
});

// Login → get JWT
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  const token = signToken(user);
  res.json({ ok: true, token, user: { email: user.email, role: user.role, name: user.name } });
});

/* ===== Admin (JWT protected) ===== */
// View all
app.get('/api/admin/issues', requireRole('admin', 'officer'), async (req, res) => {
  const items = await Issue.find().sort({ createdAt: -1 }).lean();
  res.json({ ok: true, issues: items });
});

// Update status/notes
app.patch('/api/admin/issues/:id', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { status, adminNotes } = req.body || {};

  const doc = await Issue.findById(id);
  if (!doc) return res.status(404).json({ error: 'not found' });

  if (typeof adminNotes === 'string') doc.adminNotes = adminNotes;

  const allowed = ['RECEIVED', 'UNDER_REVIEW', 'IN_PROCESS', 'RESOLVED'];
  if (status && allowed.includes(status)) {
    const prev = doc.status;
    doc.status = status;
    const now = new Date();

    if (!doc.firstResponseAt && ['UNDER_REVIEW', 'IN_PROCESS', 'RESOLVED'].includes(status)) {
      doc.firstResponseAt = now;
    }
    if (status === 'RESOLVED') doc.resolvedAt = now;
    if (prev === 'RESOLVED' && status !== 'RESOLVED') doc.resolvedAt = null;
  }

  await doc.save();
  res.json({ ok: true, issue: doc });
});

/* ===== SMS / IVR (optional; Twilio/Vonage) ===== */
async function createIssueFromWebhook({ title, description, from, locationText }) {
  const trackingId = makeTrackingId();
  await Issue.create({
    trackingId,
    title: title || 'Citizen Report',
    description: description || '(no description)',
    citizenContact: from || undefined,
    locationText: locationText || undefined
  });
  return trackingId;
}

// SMS webhook
app.post('/api/sms', async (req, res) => {
  try {
    const body = req.body.Body || req.body.text || '';   // Twilio: Body; Vonage: text
    const from = req.body.From || req.body.msisdn || ''; // Twilio: From; Vonage: msisdn

    let locationText;
    const m = body.match(/loc:(.*)$/i);
    if (m) locationText = m[1].trim();

    const trackingId = await createIssueFromWebhook({
      title: (body || 'SMS Report').slice(0, 60),
      description: body,
      from,
      locationText
    });

    // Twilio expects TwiML
    res.type('text/xml').send(`<Response><Message>Thanks! Tracking ID: ${trackingId}</Message></Response>`);
  } catch (e) {
    console.error(e);
    res.status(200).type('text/xml').send(`<Response><Message>Sorry, failed. Try again.</Message></Response>`);
  }
});

app.post('/api/whatsapp', async (req, res) => {
  try {
    const body = req.body.Body || '';
    const from = req.body.From || '';
    const m = body.match(/loc:(.*)$/i);
    const locationText = m ? m[1].trim() : undefined;
    const trackingId = await createIssueFromWebhook({
      title: (body || 'WhatsApp Report').slice(0,60),
      description: body,
      from,
      locationText
    });
    res.type('text/xml').send(`<Response><Message>Thanks! Tracking ID: ${trackingId}</Message></Response>`);
  } catch (e) {
    console.error(e);
    res.type('text/xml').send(`<Response><Message>Sorry, failed. Try again.</Message></Response>`);
  }
});

// IVR flow
app.post('/api/ivr', (req, res) => {
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Please record your message after the beep. Press pound to finish.</Say>
  <Record action="/api/ivr/recording" maxLength="60" finishOnKey="#"/>
</Response>`);
});

app.post('/api/ivr/recording', async (req, res) => {
  try {
    const from = req.body.From || '';
    const recordingUrl = req.body.RecordingUrl;
    const transcription = req.body.TranscriptionText || '';
    const description = transcription ? transcription : `Voice message: ${recordingUrl}`;

    const trackingId = await createIssueFromWebhook({
      title: 'Voice Report',
      description,
      from
    });

    res.type('text/xml').send(`<Response><Say>Thank you. Your tracking ID is ${trackingId}. Goodbye.</Say></Response>`);
  } catch (e) {
    console.error(e);
    res.type('text/xml').send(`<Response><Say>Sorry, something went wrong.</Say></Response>`);
  }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'voice2action' },
      (err, result) => {
        if (err || !result) return res.status(500).json({ error: 'upload failed' });
        res.json({ ok: true, url: result.secure_url });
      }
    );
    stream.end(req.file.buffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'upload error' });
  }
});

app.get('/api/analytics/series', async (req, res) => {
  const days = Math.min(parseInt(req.query.days || 30), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const series = await Issue.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $project: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } } },
    { $group: { _id: "$day", count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  const categories = await Issue.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  res.json({ ok: true, series, categories });
});

app.get('/api/wards/stats', async (req, res) => {
  const rows = await Issue.aggregate([
    { $match: { wardCode: { $exists: true, $ne: null, $ne: '' } } },
    {
      $group: {
        _id: '$wardCode',
        total: { $sum: 1 },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'RESOLVED'] }, 1, 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const stats = rows.map(r => ({
    wardCode: r._id,
    total: r.total,
    resolved: r.resolved,
    open: r.total - r.resolved
  }));

  res.json({ ok: true, stats });
});

// List all orgs (useful for dropdowns)
app.get('/api/orgs', async (req, res) => {
  const orgs = await Organization.find().sort({ code: 1 }).lean();
  res.json({ ok: true, orgs });
});

// Per-organization metrics (scorecard)
app.get('/api/orgs/:code/metrics', async (req, res) => {
  const code = req.params.code;

  const total = await Issue.countDocuments({ orgCode: code });
  const resolved = await Issue.countDocuments({ orgCode: code, status: 'RESOLVED' });

  const firstResp = await Issue.aggregate([
    { $match: { orgCode: code, firstResponseAt: { $ne: null } } },
    { $project: { diffHours: { $divide: [{ $subtract: ['$firstResponseAt', '$createdAt'] }, 1000 * 60 * 60] } } },
    { $group: { _id: null, avg: { $avg: '$diffHours' } } }
  ]);

  const resolution = await Issue.aggregate([
    { $match: { orgCode: code, resolvedAt: { $ne: null } } },
    { $project: { diffHours: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 1000 * 60 * 60] } } },
    { $group: { _id: null, avg: { $avg: '$diffHours' } } }
  ]);

  // categories breakdown per org
  const categories = await Issue.aggregate([
    { $match: { orgCode: code } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  res.json({
    ok: true,
    orgCode: code,
    total,
    resolved,
    resolve_rate: total ? Math.round((resolved / total) * 100) : 0,
    avg_first_response_hours: firstResp[0]?.avg ? Math.round(firstResp[0].avg) : 0,
    avg_resolution_hours: resolution[0]?.avg ? Math.round(resolution[0].avg) : 0,
    categories
  });
});


const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const specs = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Voice2Action API', version: '1.0.0' }
  },
  apis: ['./src/server.js'], // we’ll annotate routes inline
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs));
console.log('Swagger at /api/docs');

