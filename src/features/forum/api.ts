import { HttpApi } from 'effect/unstable/httpapi'

import { DiscussionsGroup } from './discussion/endpoints'
import { RepliesGroup } from './reply/endpoints'

// The whole API in one value, imported by the server layer and by the client
// atoms alike. Nothing reachable from here may import cloudflare:workers,
// drizzle or the Better Auth instance, or the database client lands in the
// browser bundle. The -live files exist to keep that true.
//
// The prefix matches the route that mounts the handler, src/routes/api/forum/$.ts,
// because HttpRouter matches on the request's own path rather than on a path
// the route has stripped.
export class ForumApi extends HttpApi.make('forumApi')
  .add(DiscussionsGroup)
  .add(RepliesGroup)
  .prefix('/api/forum') {}
