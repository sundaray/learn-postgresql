import '@tanstack/react-start/server-only'

import { HttpRouter } from 'effect/unstable/http'

import { ForumApiLive } from './layer'

// A raw Request in, a Response out. src/routes/api/forum/$.ts mounts this, and
// the server-side atom transport calls the same function in process rather than
// making the worker fetch its own URL.
export const { handler: forumWebHandler, dispose: disposeForumWebHandler } =
  HttpRouter.toWebHandler(ForumApiLive)
