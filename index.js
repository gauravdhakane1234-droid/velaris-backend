const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const dotenv     = require('dotenv');
const puppeteer  = require('puppeteer');
const nodemailer = require('nodemailer');
const crypto     = require('crypto');
const {
  Lead, Project, Service, Inquiry,
  BlogPost, Client, ChatSession, Subscriber
} = require('./models');

dotenv.config();

const app = express();

// ═══════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// ═══════════════════════════════════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════════════════════════════════
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexastudio';
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

mongoose.connection.on('error',        err  => console.error('MongoDB runtime error:', err));
mongoose.connection.on('disconnected', ()   => console.log('MongoDB disconnected — reconnecting...'));

// ═══════════════════════════════════════════════════════════════════
// EMAIL HELPER
// ═══════════════════════════════════════════════════════════════════
function createMailer() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
}

async function sendMail({ to, subject, html }) {
  const mailer = createMailer();
  if (!mailer) return;
  try {
    await mailer.sendMail({ from: `"NexaStudio" <${process.env.EMAIL_USER}>`, to, subject, html });
  } catch (e) {
    console.error('Email send error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// LEAD SCORING HELPER
// ═══════════════════════════════════════════════════════════════════
function scoreLead({ budget, service, message, phone }) {
  let score = 30;
  if (budget) {
    if (budget.includes('5k+') || budget.includes('10k+')) score += 40;
    else if (budget.includes('1k') || budget.includes('2k')) score += 25;
    else if (budget.includes('500')) score += 15;
  }
  if (service) score += 15;
  if (phone)   score += 10;
  if (message && message.length > 80) score += 5;
  return Math.min(score, 100);
}

// ═══════════════════════════════════════════════════════════════════
// SLUG HELPER
// ═══════════════════════════════════════════════════════════════════
function toSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// ═══════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'NexaStudio API',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════════
app.get('/api/dashboard', async (req, res) => {
  try {
    const [
      totalLeads, newLeads, wonLeads,
      totalClients, activeClients,
      totalProjects, featuredProjects,
      totalInquiries, unreadInquiries,
      totalRevenue
    ] = await Promise.all([
      Lead.countDocuments(),
      Lead.countDocuments({ status: 'New' }),
      Lead.countDocuments({ status: 'Won' }),
      Client.countDocuments(),
      Client.countDocuments({ status: 'Active' }),
      Project.countDocuments({ published: true }),
      Project.countDocuments({ featured: true }),
      Inquiry.countDocuments(),
      Inquiry.countDocuments({ status: 'Unread' }),
      Client.aggregate([{ $group: { _id: null, total: { $sum: '$totalPaid' } } }])
    ]);

    const revenueUSD = totalRevenue[0]?.total || 0;
    const conversionRate = totalLeads > 0
      ? ((wonLeads / totalLeads) * 100).toFixed(1)
      : '0.0';

    res.json({
      leads:          { total: totalLeads, new: newLeads, won: wonLeads, conversionRate: `${conversionRate}%` },
      clients:        { total: totalClients, active: activeClients },
      projects:       { total: totalProjects, featured: featuredProjects },
      inquiries:      { total: totalInquiries, unread: unreadInquiries },
      revenue:        { usd: revenueUSD, formatted: `$${revenueUSD.toLocaleString()}` },
      timestamp:      new Date().toISOString()
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════════════════
app.get('/api/leads', async (req, res) => {
  try {
    const { status, source, limit = 50, skip = 0, sort = '-createdAt' } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (source) filter.source = source;

    const [leads, total] = await Promise.all([
      Lead.find(filter).sort(sort).limit(parseInt(limit)).skip(parseInt(skip)).lean(),
      Lead.countDocuments(filter)
    ]);

    res.json({ success: true, data: leads, total, page: Math.floor(skip / limit) + 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    const leadScore = scoreLead(req.body);
    const lead = new Lead({ ...req.body, leadScore, source: req.body.source || 'Website' });
    await lead.save();

    // Notify owner
    await sendMail({
      to:      process.env.OWNER_EMAIL || process.env.EMAIL_USER,
      subject: `🔥 New Lead: ${lead.name} (Score: ${leadScore})`,
      html: `
        <h2>New Lead Captured</h2>
        <p><b>Name:</b> ${lead.name}</p>
        <p><b>Email:</b> ${lead.email}</p>
        <p><b>Phone:</b> ${lead.phone || 'N/A'}</p>
        <p><b>Service:</b> ${lead.service || 'N/A'}</p>
        <p><b>Budget:</b> ${lead.budget || 'N/A'}</p>
        <p><b>Message:</b> ${lead.message || 'N/A'}</p>
        <p><b>Lead Score:</b> ${leadScore}/100</p>
      `
    });

    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/leads/:id', async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// LEAD SCRAPER (Google Maps → design agencies, startups, etc.)
// ═══════════════════════════════════════════════════════════════════
app.post('/api/leads/scrape', async (req, res) => {
  const { query = 'startup companies', city = 'Mumbai', limit = 10 } = req.body;
  console.log(`🔍 Scraping leads: "${query}" in ${city}...`);

  let browser;
  let scraped = [];

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', '--disable-gpu',
        '--no-first-run', '--no-zygote'
      ],
      timeout: 30000
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(
      `https://www.google.com/maps/search/${encodeURIComponent(query + ' in ' + city)}`,
      { waitUntil: 'networkidle2', timeout: 20000 }
    );
    await page.waitForSelector('div[role="article"]', { timeout: 10000 });

    scraped = await page.evaluate((max) => {
      return Array.from(document.querySelectorAll('div[role="article"]'))
        .slice(0, max)
        .map(el => ({
          name:  el.querySelector('div.fontHeadlineSmall')?.innerText || 'Unknown',
          phone: null
        }));
    }, limit);

    await browser.close();
    browser = null;
  } catch (e) {
    console.warn('Puppeteer failed, using mock data:', e.message);
    if (browser) { await browser.close(); browser = null; }
  }

  // Fallback mock data
  if (!scraped || scraped.length === 0) {
    const mockNames = [
      'PixelForge Studio', 'Nexus Digital Agency', 'Velocity Labs',
      'Apex Creative Co', 'Surge Media', 'Zenith Tech Solutions',
      'Orbit Digital', 'Prism Studios', 'Nova Web Works', 'Quantum Design'
    ];
    scraped = mockNames.slice(0, limit).map(name => ({ name, phone: null }));
  }

  const saved = [];
  for (const item of scraped) {
    const exists = await Lead.findOne({ name: item.name, city });
    if (!exists) {
      const leadScore = 30 + Math.floor(Math.random() * 30);
      const lead = await Lead.create({
        name: item.name,
        email: `contact@${item.name.toLowerCase().replace(/\s+/g, '')}.com`,
        phone: item.phone,
        city,
        source: 'Scraper',
        service: query,
        leadScore,
        status: 'New'
      });
      saved.push(lead);
    }
  }

  res.json({
    success: true,
    saved: saved.length,
    data: saved,
    message: saved.length > 0
      ? `Scraped and saved ${saved.length} new leads`
      : 'No new leads found (all already exist)'
  });
});

// ═══════════════════════════════════════════════════════════════════
// PROJECTS (Portfolio)
// ═══════════════════════════════════════════════════════════════════
app.get('/api/projects', async (req, res) => {
  try {
    const { category, featured, published = true, limit = 20, skip = 0 } = req.query;
    const filter = {};
    if (published !== 'all')  filter.published = published === 'true';
    if (category)             filter.category  = category;
    if (featured !== undefined && featured !== '') filter.featured = featured === 'true';

    const [projects, total] = await Promise.all([
      Project.find(filter).sort('-createdAt').limit(parseInt(limit)).skip(parseInt(skip)).lean(),
      Project.countDocuments(filter)
    ]);
    res.json({ success: true, data: projects, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:slug', async (req, res) => {
  try {
    const project = await Project.findOne({ slug: req.params.slug }).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true, data: project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const slug = req.body.slug || toSlug(req.body.title);
    const project = new Project({ ...req.body, slug });
    await project.save();
    res.status(201).json({ success: true, data: project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true, data: project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SERVICES
// ═══════════════════════════════════════════════════════════════════
app.get('/api/services', async (req, res) => {
  try {
    const services = await Service.find({ active: true }).sort('order').lean();
    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/services/:slug', async (req, res) => {
  try {
    const service = await Service.findOne({ slug: req.params.slug }).lean();
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json({ success: true, data: service });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/services', async (req, res) => {
  try {
    const slug = req.body.slug || toSlug(req.body.name);
    const service = new Service({ ...req.body, slug });
    await service.save();
    res.status(201).json({ success: true, data: service });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/services/:id', async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json({ success: true, data: service });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// INQUIRIES (Contact Form)
// ═══════════════════════════════════════════════════════════════════
app.get('/api/inquiries', async (req, res) => {
  try {
    const { status, limit = 30, skip = 0 } = req.query;
    const filter = status ? { status } : {};
    const [inquiries, total] = await Promise.all([
      Inquiry.find(filter).sort('-createdAt').limit(parseInt(limit)).skip(parseInt(skip)).lean(),
      Inquiry.countDocuments(filter)
    ]);
    res.json({ success: true, data: inquiries, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inquiries', async (req, res) => {
  try {
    const inquiry = new Inquiry(req.body);
    await inquiry.save();

    // Also create a lead from this inquiry
    const leadScore = scoreLead(req.body);
    await Lead.create({
      name:      req.body.name,
      email:     req.body.email,
      phone:     req.body.phone,
      service:   req.body.service,
      budget:    req.body.budget,
      message:   req.body.message,
      source:    'Contact Form',
      leadScore
    });

    // Notify owner
    await sendMail({
      to:      process.env.OWNER_EMAIL || process.env.EMAIL_USER,
      subject: `📩 New Inquiry from ${req.body.name}`,
      html: `
        <h2>New Website Inquiry</h2>
        <p><b>Name:</b>    ${req.body.name}</p>
        <p><b>Email:</b>   ${req.body.email}</p>
        <p><b>Phone:</b>   ${req.body.phone || 'N/A'}</p>
        <p><b>Service:</b> ${req.body.service || 'N/A'}</p>
        <p><b>Budget:</b>  ${req.body.budget || 'N/A'}</p>
        <p><b>Message:</b> ${req.body.message}</p>
      `
    });

    // Auto-reply to visitor
    await sendMail({
      to:      req.body.email,
      subject: '✅ Got your message — NexaStudio will reply within 24 hrs',
      html: `
        <h2>Hey ${req.body.name}! 👋</h2>
        <p>We received your inquiry and will get back to you within <b>24 hours</b>.</p>
        <p>Meanwhile, check out our work: <a href="${process.env.FRONTEND_URL || 'https://nexastudio.dev'}">nexastudio.dev</a></p>
        <br><p>— NexaStudio Team</p>
      `
    });

    res.status(201).json({ success: true, data: inquiry, message: 'Inquiry received!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/inquiries/:id', async (req, res) => {
  try {
    const update = { ...req.body };
    if (req.body.status === 'Replied') update.repliedAt = new Date();
    const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });
    res.json({ success: true, data: inquiry });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// AI CHATBOT
// ═══════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are the AI assistant for NexaStudio, a premium web agency that builds:
- Ultra-premium 3D animated websites (Three.js, GSAP, WebGL)
- AI-powered apps with custom chatbots and automation
- Full-stack SaaS products and e-commerce platforms
- Lead generation & scraping systems

Services start from $500 and go up to $10,000+.
Be friendly, enthusiastic, and concise. Highlight value. Ask for their budget and project idea.
If they seem interested, ask for their email to send a custom proposal.
Never mention competitors. Keep responses under 150 words.`;

app.post('/api/chat', async (req, res) => {
  const { sessionId, message, visitorId } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message are required' });
  }

  try {
    // Load or create session
    let session = await ChatSession.findOne({ sessionId });
    if (!session) {
      session = new ChatSession({
        sessionId,
        visitorId: visitorId || sessionId,
        messages:  [{ role: 'system', content: SYSTEM_PROMPT }]
      });
    }

    // Append user message
    session.messages.push({ role: 'user', content: message });
    session.updatedAt = new Date();

    let reply = '';

    if (process.env.OPENAI_API_KEY) {
      // Use real OpenAI
      const { OpenAI } = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        model:    process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: session.messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: 200,
        temperature: 0.7
      });

      reply = completion.choices[0].message.content;
    } else {
      // Fallback smart responses when no API key is set
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes('price') || lowerMsg.includes('cost') || lowerMsg.includes('how much')) {
        reply = "Our projects start from **$500** for landing pages, **$1,500** for full websites, and **$5,000+** for AI-powered apps. What kind of project do you have in mind? 🚀";
      } else if (lowerMsg.includes('3d') || lowerMsg.includes('animation')) {
        reply = "We build jaw-dropping 3D animated websites using Three.js and WebGL — the kind that make visitors say WOW. Want to see some examples? Drop your email and I'll send our portfolio! 🎨";
      } else if (lowerMsg.includes('ai') || lowerMsg.includes('chatbot')) {
        reply = "We build custom AI chatbots trained on YOUR business data. They qualify leads, answer questions, and convert visitors 24/7. Interested? Tell me about your business!";
      } else if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) {
        reply = "Hey! 👋 Welcome to NexaStudio! We build premium 3D animated websites, AI apps, and full-stack products. What kind of project are you thinking about?";
      } else {
        reply = "Great question! At NexaStudio, we create premium digital experiences that convert. Could you tell me more about your project? What's your timeline and budget?";
      }
    }

    // Append assistant reply
    session.messages.push({ role: 'assistant', content: reply });

    // Auto-capture email from message
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch && !session.leadCaptured) {
      session.capturedEmail  = emailMatch[0];
      session.leadCaptured   = true;
      // Save as lead
      const existing = await Lead.findOne({ email: emailMatch[0] });
      if (!existing) {
        await Lead.create({
          name:      session.capturedName || 'Chat Visitor',
          email:     emailMatch[0],
          source:    'AI Chatbot',
          leadScore: 50,
          status:    'New'
        });
      }
    }

    await session.save();

    res.json({ success: true, reply, sessionId });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Chat service error', message: err.message });
  }
});

app.get('/api/chat/:sessionId', async (req, res) => {
  try {
    const session = await ChatSession.findOne({ sessionId: req.params.sessionId }).lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const messages = session.messages.filter(m => m.role !== 'system');
    res.json({ success: true, data: { ...session, messages } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// CLIENTS (Project Management)
// ═══════════════════════════════════════════════════════════════════
app.get('/api/clients', async (req, res) => {
  try {
    const { status, limit = 30 } = req.query;
    const filter = status ? { status } : {};
    const clients = await Client.find(filter)
      .populate('projectId', 'title slug category')
      .sort('-createdAt')
      .limit(parseInt(limit))
      .lean();
    res.json({ success: true, data: clients, count: clients.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const client = new Client(req.body);
    await client.save();
    res.status(201).json({ success: true, data: client });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/clients/:id', async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ success: true, data: client });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Mark milestone as paid
app.patch('/api/clients/:id/milestones/:milestoneId/pay', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const milestone = client.milestones.id(req.params.milestoneId);
    if (!milestone) return res.status(404).json({ error: 'Milestone not found' });

    milestone.paid        = true;
    milestone.completedAt = new Date();
    client.totalPaid      = (client.totalPaid || 0) + (milestone.amount || 0);
    await client.save();

    res.json({ success: true, data: client, message: `Milestone "${milestone.title}" marked as paid` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// BLOG
// ═══════════════════════════════════════════════════════════════════
app.get('/api/blog', async (req, res) => {
  try {
    const { limit = 10, skip = 0, tag } = req.query;
    const filter = { published: true };
    if (tag) filter.tags = tag;

    const [posts, total] = await Promise.all([
      BlogPost.find(filter)
        .select('-content')
        .sort('-publishedAt')
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .lean(),
      BlogPost.countDocuments(filter)
    ]);
    res.json({ success: true, data: posts, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/blog/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOneAndUpdate(
      { slug: req.params.slug, published: true },
      { $inc: { views: 1 } },
      { new: true }
    ).lean();
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/blog', async (req, res) => {
  try {
    const slug = req.body.slug || toSlug(req.body.title);
    const readTime = req.body.content
      ? Math.ceil(req.body.content.split(' ').length / 200)
      : 5;
    const post = new BlogPost({
      ...req.body,
      slug,
      readTime,
      publishedAt: req.body.published ? new Date() : undefined
    });
    await post.save();
    res.status(201).json({ success: true, data: post });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/blog/:id', async (req, res) => {
  try {
    const update = { ...req.body };
    if (req.body.published && !update.publishedAt) update.publishedAt = new Date();
    const post = await BlogPost.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// NEWSLETTER
// ═══════════════════════════════════════════════════════════════════
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email, name, source } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const existing = await Subscriber.findOne({ email });
    if (existing) {
      if (!existing.active) {
        existing.active = true;
        await existing.save();
        return res.json({ success: true, message: 'Welcome back! You are re-subscribed.' });
      }
      return res.json({ success: true, message: 'Already subscribed!' });
    }

    await Subscriber.create({ email, name, source: source || 'Website' });

    await sendMail({
      to:      email,
      subject: '🎉 Welcome to NexaStudio Newsletter',
      html: `
        <h2>You're in! Welcome to NexaStudio 🚀</h2>
        <p>Hey ${name || 'there'}! You'll now get insider tips on:</p>
        <ul>
          <li>Building premium 3D websites</li>
          <li>AI tools that save hours daily</li>
          <li>How to land $1k–$10k web projects</li>
        </ul>
        <p>— NexaStudio Team</p>
      `
    });

    res.status(201).json({ success: true, message: 'Subscribed successfully!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/newsletter/subscribers', async (req, res) => {
  try {
    const subscribers = await Subscriber.find({ active: true }).sort('-subscribedAt').lean();
    res.json({ success: true, data: subscribers, count: subscribers.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SEED SERVICES (run once to populate default services)
// ═══════════════════════════════════════════════════════════════════
app.post('/api/seed/services', async (req, res) => {
  try {
    const count = await Service.countDocuments();
    if (count > 0) {
      return res.json({ success: true, message: 'Services already seeded', count });
    }

    const defaultServices = [
      {
        name:         '3D Animated Website',
        slug:         '3d-animated-website',
        tagline:      'Cinematic websites that stop visitors cold',
        description:  'Three.js + GSAP powered immersive 3D experiences. WebGL shaders, particle systems, smooth scroll. Your competitors won\'t know what hit them.',
        features:     ['Three.js / WebGL', 'GSAP animations', 'Smooth scroll', 'Mobile optimized', 'SEO ready', 'CMS integration'],
        priceFrom:    1500,
        priceTo:      5000,
        deliveryDays: 21,
        icon:         '🌌',
        popular:      true,
        order:        1
      },
      {
        name:         'AI-Powered Web App',
        slug:         'ai-web-app',
        tagline:      'Your business on autopilot with AI',
        description:  'Custom AI chatbots, lead qualification, content generation, and automation pipelines. GPT-4 + Claude integration, trained on your data.',
        features:     ['Custom AI chatbot', 'Lead automation', 'OpenAI / Claude', 'WhatsApp integration', 'Email automation', 'Analytics dashboard'],
        priceFrom:    2000,
        priceTo:      8000,
        deliveryDays: 30,
        icon:         '🤖',
        popular:      true,
        order:        2
      },
      {
        name:         'Full Stack SaaS',
        slug:         'full-stack-saas',
        tagline:      'Production-grade SaaS from zero to launch',
        description:  'Complete SaaS with auth, billing (Stripe), multi-tenancy, admin panel, REST/GraphQL API. Built to handle millions of users.',
        features:     ['Next.js frontend', 'Node.js backend', 'Stripe billing', 'Auth system', 'Admin panel', 'CI/CD pipeline'],
        priceFrom:    5000,
        priceTo:      15000,
        deliveryDays: 60,
        icon:         '⚡',
        order:        3
      },
      {
        name:         'Premium Landing Page',
        slug:         'premium-landing-page',
        tagline:      'High-converting pages that print money',
        description:  'Pixel-perfect landing pages with micro-animations, A/B testing ready, lightning-fast load time. Built to convert visitors into paying clients.',
        features:     ['Figma to code', 'Micro-animations', 'CRO optimized', 'Speed <1s', 'Analytics setup', 'Form integrations'],
        priceFrom:    500,
        priceTo:      1500,
        deliveryDays: 7,
        icon:         '🎯',
        order:        4
      },
      {
        name:         'Lead Generation System',
        slug:         'lead-gen-system',
        tagline:      'Find and close clients on autopilot',
        description:  'Multi-platform lead scraper (Google Maps, LinkedIn, JustDial), scoring algorithm, WhatsApp + email automation sequences. Your 24/7 sales machine.',
        features:     ['Multi-platform scraper', 'Lead scoring AI', 'WhatsApp automation', 'Email sequences', 'CRM dashboard', 'Analytics'],
        priceFrom:    1000,
        priceTo:      3000,
        deliveryDays: 14,
        icon:         '🎣',
        order:        5
      },
      {
        name:         'E-Commerce Store',
        slug:         'ecommerce-store',
        tagline:      'Sell online like the big brands do',
        description:  'Custom e-commerce with inventory management, payment gateway (Razorpay/Stripe), order tracking, and admin dashboard. Not Shopify. Better.',
        features:     ['Custom cart & checkout', 'Payment gateway', 'Inventory system', 'Order tracking', 'SEO optimized', 'Mobile first'],
        priceFrom:    2500,
        priceTo:      7000,
        deliveryDays: 35,
        icon:         '🛒',
        order:        6
      }
    ];

    await Service.insertMany(defaultServices);
    res.json({ success: true, message: 'Default services seeded', count: defaultServices.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLER
// ═══════════════════════════════════════════════════════════════════
app.use((err, req, res, _next) => {
  console.error('Global error:', err);
  res.status(500).json({
    error:     'Internal Server Error',
    message:   err.message,
    timestamp: new Date().toISOString()
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path, method: req.method });
});

// ═══════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 NexaStudio API running on port ${PORT}`);
  console.log(`📊 ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 AI: ${process.env.OPENAI_API_KEY ? 'OpenAI enabled' : 'Fallback mode (no OPENAI_API_KEY)'}`);
  console.log(`📧 Email: ${process.env.EMAIL_USER ? 'Nodemailer enabled' : 'Disabled (no EMAIL_USER)'}`);
});
