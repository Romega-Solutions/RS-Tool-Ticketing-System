# RS Ticketing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the custom Next.js web application for the RS Ticketing System (Option A from docs) featuring multi-user auth, project/task tracking, and automated weekly report generation.

**Architecture:** Next.js App Router (React), SQLite database with Drizzle ORM, custom JWT authentication via HTTP-only cookies, and shadcn/ui for UI components.

**Tech Stack:** Next.js, Tailwind CSS, shadcn/ui, SQLite, Drizzle ORM, jose (JWT)

---

### Task 1: Scaffold Next.js Application & Database

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`

- [ ] **Step 1: Scaffold Next.js**
```bash
npx create-next-app@latest temp-app --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
mv temp-app/* temp-app/.* . 2>/dev/null || true
rm -rf temp-app
```

- [ ] **Step 2: Install dependencies**
```bash
npm install drizzle-orm better-sqlite3 jose bcryptjs
npm install -D drizzle-kit @types/better-sqlite3 @types/bcryptjs
npx shadcn@latest init -d
```

- [ ] **Step 3: Setup Database Schema**
```typescript
// Create src/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').notNull(),
  team: text('team'),
  jobTitle: text('job_title'),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
});
```

- [ ] **Step 4: Setup Drizzle Config & DB Client**
```typescript
// Create drizzle.config.ts
import type { Config } from 'drizzle-kit';
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: 'sqlite.db' }
} satisfies Config;

// Create src/db/index.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('sqlite.db');
export const db = drizzle(sqlite, { schema });
```

- [ ] **Step 5: Generate & Push DB schema**
```bash
npx drizzle-kit generate
npx drizzle-kit push
```

- [ ] **Step 6: Commit**
```bash
git add .
git commit -m "chore: scaffold Next.js app and setup SQLite/Drizzle"
```

### Task 2: Setup Authentication Foundation

**Files:**
- Create: `src/lib/auth.ts`, `src/middleware.ts`
- Create: `src/app/login/page.tsx`, `src/app/api/auth/login/route.ts`

- [ ] **Step 1: Write Auth Lib (JWT handling)**
```typescript
// Create src/lib/auth.ts
import { jwtVerify, SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key-change-in-prod');

export async function signToken(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch (error) {
    return null;
  }
}
```

- [ ] **Step 2: Write Middleware**
```typescript
// Create src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('session_token')?.value;
  const isAuthPage = req.nextUrl.pathname.startsWith('/login');

  if (isAuthPage) {
    if (token && await verifyToken(token)) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  if (!token || !(await verifyToken(token))) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 3: Create Login Page UI**
```bash
npx shadcn@latest add card button input label form
```

- [ ] **Step 4: Commit**
```bash
git add .
git commit -m "feat: setup JWT authentication and login page"
```