import '@tanstack/react-start/server-only'

import * as Layer from 'effect/Layer'
import { HttpServer } from 'effect/unstable/http'
import { HttpApiBuilder } from 'effect/unstable/httpapi'

import { ForumApi } from './api'
import { DiscussionRepositoryLive } from './discussion/discussion-repository-live'
import { DiscussionEndpointHandlers } from './discussion/endpoint-handlers'
import { DiscussionServiceLive } from './discussion/service'
import { IdServiceLive } from './id-service-live'
import { AdminMiddlewareLive, AuthMiddlewareLive } from './middleware-live'
import { ReplyEndpointHandlers } from './reply/endpoint-handlers'
import { ReplyRepositoryLive } from './reply/reply-repository-live'
import { ReplyServiceLive } from './reply/service'
import { SessionGatewayLive } from './session-gateway-live'
import { ValidationMiddlewareLive } from './validation'

// Everything assembled. This is the only file that names both an endpoint
// handler and a -live implementation, which is what keeps every other file
// either shared or server-only rather than both.

const ServicesLive = Layer.mergeAll(
  DiscussionServiceLive.pipe(
    Layer.provide([DiscussionRepositoryLive, IdServiceLive]),
  ),
  ReplyServiceLive.pipe(Layer.provide([ReplyRepositoryLive, IdServiceLive])),
)

// Section 9's first trap: middleware resolves when the layer is built, so it is
// provided *into* the group layers rather than merged beside them. Merged, the
// symptom is a "Service not found" at runtime with the layer visibly present.
const MiddlewareLive = Layer.mergeAll(
  AuthMiddlewareLive,
  AdminMiddlewareLive,
).pipe(Layer.provide(SessionGatewayLive))

export const ForumApiLive = HttpApiBuilder.layer(ForumApi).pipe(
  Layer.provide([DiscussionEndpointHandlers, ReplyEndpointHandlers]),
  Layer.provide(ServicesLive),
  Layer.provide(MiddlewareLive),
  Layer.provide(ValidationMiddlewareLive),
  // Section 14: @effect/platform-node cannot be imported under workerd at all,
  // so HttpApiBuilder.layer's four platform requirements come from here. The
  // tradeoff is FileSystem.layerNoop, which this JSON API does not care about.
  Layer.provide(HttpServer.layerServices),
)
