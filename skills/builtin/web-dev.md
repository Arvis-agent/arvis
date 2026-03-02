---
slug: web-dev
name: Web Development
description: Best practices for web development including HTML, CSS, JavaScript, TypeScript, React, Next.js, APIs, and databases.
category: coding
triggers:
  keywords: [html, css, javascript, typescript, react, next.js, nextjs, vue, angular, node, express, api, rest, graphql, database, sql, postgres, mysql, sqlite, prisma, tailwind, webpack, vite, frontend, backend, fullstack]
  patterns: [".*component.*", ".*endpoint.*", ".*api route.*", ".*sql query.*"]
---

# Web Development

## General Principles
- Write clean, readable code with meaningful variable/function names
- Keep components small and single-responsibility
- Always handle errors and edge cases
- Write code that is easy to test

## TypeScript
- Prefer explicit types over `any`
- Use interfaces for object shapes, types for unions/primitives
- Enable strict mode in tsconfig

## React / Next.js
- Use Server Components by default, Client Components only when needed (interactivity, hooks, browser APIs)
- Keep state as local as possible — lift only when necessary
- Use `useCallback` and `useMemo` only when profiling shows a need

## APIs
- RESTful: use correct HTTP methods (GET read, POST create, PATCH update, DELETE remove)
- Always validate input at the boundary
- Return consistent error shapes: `{ error: string, code?: string }`
- Use 400 for bad input, 401 for auth, 403 for forbidden, 404 for not found, 500 for server error

## Databases
- Always use parameterized queries (never string concatenation — SQL injection)
- Index columns used in WHERE clauses
- Use transactions for multi-step writes

## Security
- Never expose secrets in client-side code
- Sanitize all user input before rendering
- Use HTTPS in production
- Set appropriate CORS policies
