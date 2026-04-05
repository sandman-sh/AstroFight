import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
  finalizeMatchServer,
  prepareMatchStateServer,
  toHttpError,
  type MatchFinalizeRequest,
  type MatchPrepareRequest,
} from './matchApi'

async function readJsonBody(request: IncomingMessage) {
  const chunks: Uint8Array[] = []

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  if (!chunks.length) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  route: 'prepare' | 'finalize',
) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const body = await readJsonBody(request)
    const payload =
      route === 'prepare'
        ? await prepareMatchStateServer(body as MatchPrepareRequest)
        : await finalizeMatchServer(body as MatchFinalizeRequest)

    sendJson(response, 200, payload)
  } catch (error) {
    const httpError = toHttpError(error)
    sendJson(response, httpError.status, { error: httpError.message })
  }
}

export function createViteMatchApiPlugin(): Plugin {
  return {
    name: 'astrofight-match-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = request.url?.split('?')[0]

        if (url === '/api/match/prepare') {
          await handleRequest(request, response, 'prepare')
          return
        }

        if (url === '/api/match/finalize') {
          await handleRequest(request, response, 'finalize')
          return
        }

        next()
      })
    },
  }
}
