# 🚀 NexaStudio API

> **Premium AI-Powered Web Agency Backend**
> Full-featured REST API powering a high-ticket web agency — 3D animated websites, AI chatbots, lead generation, client portal, and more.

---

## Stack

| Layer       | Tech                          |
|-------------|-------------------------------|
| Runtime     | Node.js 18+                   |
| Framework   | Express.js                    |
| Database    | MongoDB + Mongoose             |
| AI          | OpenAI GPT-4o-mini (optional) |
| Email       | Nodemailer (Gmail)            |
| Scraping    | Puppeteer                     |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# → fill in MONGODB_URI, OPENAI_API_KEY, EMAIL_USER, EMAIL_PASS

# 3. Start dev server
npm run dev

# 4. Seed default services (run once)
curl -X POST http://localhost:5000/api/seed/services
```

---

## API Reference

### 🩺 Health
| Method | Route     | Description        |
|--------|-----------|--------------------|
| GET    | `/health` | Server health check|

### 📊 Dashboard
| Method | Route           | Description            |
|--------|-----------------|------------------------|
| GET    | `/api/dashboard`| Aggregated agency stats|

### 🎯 Leads
| Method | Route               | Description                        |
|--------|---------------------|------------------------------------|
| GET    | `/api/leads`        | List leads (filter by status/source)|
| POST   | `/api/leads`        | Create lead (auto-scored + email)  |
| PATCH  | `/api/leads/:id`    | Update lead status / notes         |
| DELETE | `/api/leads/:id`    | Delete lead                        |
| POST   | `/api/leads/scrape` | Scrape leads from Google Maps      |

**Scrape body:**
```json
{ "query": "startup companies", "city": "Mumbai", "limit": 10 }
```

### 🖼️ Projects (Portfolio)
| Method | Route                  | Description               |
|--------|------------------------|---------------------------|
| GET    | `/api/projects`        | List published projects    |
| GET    | `/api/projects/:slug`  | Get single project         |
| POST   | `/api/projects`        | Create project             |
| PATCH  | `/api/projects/:id`    | Update project             |
| DELETE | `/api/projects/:id`    | Delete project             |

### ⚙️ Services
| Method | Route                  | Description              |
|--------|------------------------|--------------------------|
| GET    | `/api/services`        | List active services     |
| GET    | `/api/services/:slug`  | Get single service       |
| POST   | `/api/services`        | Create service           |
| PATCH  | `/api/services/:id`    | Update service           |

### 📩 Inquiries (Contact Form)
| Method | Route                  | Description                          |
|--------|------------------------|--------------------------------------|
| GET    | `/api/inquiries`       | List inquiries                       |
| POST   | `/api/inquiries`       | Submit inquiry (auto-creates lead + emails)|
| PATCH  | `/api/inquiries/:id`   | Update status (Unread/Read/Replied)  |

### 🤖 AI Chatbot
| Method | Route                   | Description                          |
|--------|-------------------------|--------------------------------------|
| POST   | `/api/chat`             | Send message, get AI reply           |
| GET    | `/api/chat/:sessionId`  | Get chat history for session         |

**Chat body:**
```json
{
  "sessionId": "unique-session-id",
  "message":   "Hi, I want a 3D website",
  "visitorId": "optional-visitor-id"
}
```
> Works without `OPENAI_API_KEY` using smart fallback responses.  
> Auto-captures emails from chat and saves them as leads.

### 👤 Clients (Project Management)
| Method | Route                                         | Description            |
|--------|-----------------------------------------------|------------------------|
| GET    | `/api/clients`                                | List clients           |
| POST   | `/api/clients`                                | Create client          |
| PATCH  | `/api/clients/:id`                            | Update client          |
| PATCH  | `/api/clients/:id/milestones/:milestoneId/pay`| Mark milestone as paid |

### 📝 Blog
| Method | Route              | Description                  |
|--------|--------------------|------------------------------|
| GET    | `/api/blog`        | List published posts         |
| GET    | `/api/blog/:slug`  | Get post (increments views)  |
| POST   | `/api/blog`        | Create post                  |
| PATCH  | `/api/blog/:id`    | Update / publish post        |

### 📧 Newsletter
| Method | Route                          | Description            |
|--------|--------------------------------|------------------------|
| POST   | `/api/newsletter/subscribe`    | Subscribe email        |
| GET    | `/api/newsletter/subscribers`  | List subscribers       |

### 🌱 Seed
| Method | Route                  | Description                   |
|--------|------------------------|-------------------------------|
| POST   | `/api/seed/services`   | Seed 6 default services (once)|

---

## Lead Scoring Logic

| Signal           | Score |
|------------------|-------|
| Base             | +30   |
| Budget $5k+      | +40   |
| Budget $1k–$2k   | +25   |
| Budget $500       | +15   |
| Service specified | +15   |
| Phone provided   | +10   |
| Long message     | +5    |
| **Max**          | 100   |

---

## Services (seeded by default)

| Service                   | Price Range    | Delivery  |
|---------------------------|----------------|-----------|
| 3D Animated Website       | $1,500–$5,000  | 21 days   |
| AI-Powered Web App        | $2,000–$8,000  | 30 days   |
| Full Stack SaaS           | $5,000–$15,000 | 60 days   |
| Premium Landing Page      | $500–$1,500    | 7 days    |
| Lead Generation System    | $1,000–$3,000  | 14 days   |
| E-Commerce Store          | $2,500–$7,000  | 35 days   |

---

## Environment Variables

See [`.env.example`](.env.example)

---

## Frontend Integration

This backend is designed to power a **Next.js + Three.js** frontend:

- Connect `/api/chat` to a floating chatbot widget
- Use `/api/projects` to populate the portfolio section
- Use `/api/services` for the pricing/services section
- Use `/api/inquiries` for the contact form
- Use `/api/newsletter/subscribe` for the email capture
