/// <reference types="@cloudflare/workers-types" />

import type { WebsiteEnv } from '../alchemy.run.ts'

declare global {
  type Env = WebsiteEnv
}

declare module 'cloudflare:workers' {
  namespace Cloudflare {
    interface Env extends WebsiteEnv {}
  }
}

export {}
