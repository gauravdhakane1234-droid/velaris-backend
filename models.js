const mongoose = require('mongoose');

// ─── LEAD ───────────────────────────────────────────────────────────────────
const leadSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  email:       { type: String, required: true },
  phone:       String,
  company:     String,
  budget:      String,
  service:     String,
  message:     String,
  source:      { type: String, default: 'Website' },
  city:        String,
  country:     String,
  leadScore:   { type: Number, default: 0 },
  status:      {
    type: String,
    enum: ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'],
    default: 'New'
  },
  notes:       String,
  followUpAt:  Date,
  convertedAt: Date,
  createdAt:   { type: Date, default: Date.now }
});

// ─── PROJECT ────────────────────────────────────────────────────────────────
const projectSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  slug:         { type: String, unique: true },
  client:       String,
  description:  String,
  techStack:    [String],
  category:     {
    type: String,
    enum: ['3D Website', 'AI App', 'Full Stack', 'E-Commerce', 'SaaS', 'Other'],
    default: 'Full Stack'
  },
  coverImage:   String,
  images:       [String],
  liveUrl:      String,
  githubUrl:    String,
  featured:     { type: Boolean, default: false },
  published:    { type: Boolean, default: false },
  price:        Number,
  duration:     String,
  testimonial:  String,
  rating:       { type: Number, min: 1, max: 5 },
  createdAt:    { type: Date, default: Date.now }
});

// ─── SERVICE ────────────────────────────────────────────────────────────────
const serviceSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  slug:         { type: String, unique: true },
  tagline:      String,
  description:  String,
  features:     [String],
  priceFrom:    Number,
  priceTo:      Number,
  deliveryDays: Number,
  icon:         String,
  popular:      { type: Boolean, default: false },
  active:       { type: Boolean, default: true },
  order:        { type: Number, default: 0 },
  createdAt:    { type: Date, default: Date.now }
});

// ─── INQUIRY ─────────────────────────────────────────────────────────────────
const inquirySchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true },
  phone:     String,
  subject:   String,
  message:   { type: String, required: true },
  service:   String,
  budget:    String,
  status:    { type: String, enum: ['Unread', 'Read', 'Replied'], default: 'Unread' },
  repliedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

// ─── BLOG POST ───────────────────────────────────────────────────────────────
const blogPostSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  slug:        { type: String, unique: true },
  excerpt:     String,
  content:     String,
  coverImage:  String,
  tags:        [String],
  published:   { type: Boolean, default: false },
  views:       { type: Number, default: 0 },
  readTime:    Number,
  author:      { type: String, default: 'NexaStudio' },
  publishedAt: Date,
  createdAt:   { type: Date, default: Date.now }
});

// ─── CLIENT ──────────────────────────────────────────────────────────────────
const clientSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  email:         { type: String, required: true },
  phone:         String,
  company:       String,
  projectId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  totalPaid:     { type: Number, default: 0 },
  totalContract: Number,
  currency:      { type: String, default: 'USD' },
  status:        {
    type: String,
    enum: ['Active', 'Completed', 'Paused', 'Cancelled'],
    default: 'Active'
  },
  milestones: [{
    title:       String,
    dueDate:     Date,
    completedAt: Date,
    amount:      Number,
    paid:        { type: Boolean, default: false }
  }],
  portalAccess: { type: Boolean, default: false },
  notes:        String,
  createdAt:    { type: Date, default: Date.now }
});

// ─── CHAT SESSION ─────────────────────────────────────────────────────────────
const chatSessionSchema = new mongoose.Schema({
  sessionId:  { type: String, required: true, unique: true },
  visitorId:  String,
  messages: [{
    role:      { type: String, enum: ['user', 'assistant', 'system'] },
    content:   String,
    timestamp: { type: Date, default: Date.now }
  }],
  leadCaptured:  { type: Boolean, default: false },
  capturedEmail: String,
  capturedName:  String,
  createdAt:     { type: Date, default: Date.now },
  updatedAt:     { type: Date, default: Date.now }
});

// ─── NEWSLETTER SUBSCRIBER ───────────────────────────────────────────────────
const subscriberSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true },
  name:         String,
  source:       { type: String, default: 'Website' },
  active:       { type: Boolean, default: true },
  subscribedAt: { type: Date, default: Date.now }
});

module.exports = {
  Lead:        mongoose.model('Lead',        leadSchema),
  Project:     mongoose.model('Project',     projectSchema),
  Service:     mongoose.model('Service',     serviceSchema),
  Inquiry:     mongoose.model('Inquiry',     inquirySchema),
  BlogPost:    mongoose.model('BlogPost',    blogPostSchema),
  Client:      mongoose.model('Client',      clientSchema),
  ChatSession: mongoose.model('ChatSession', chatSessionSchema),
  Subscriber:  mongoose.model('Subscriber',  subscriberSchema)
};
