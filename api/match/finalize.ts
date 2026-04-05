type MatchFinalizeRequest = {
  roomCode: string
  creatorWallet: string
  winnerWallet: string
  reason: 'hp' | 'disconnect' | 'timeout'
}

type ApiRequest = {
  method?: string
  body?: MatchFinalizeRequest
}

type ApiResponse = {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

async function readJsonRequestBody<T>(request: { body?: unknown; [Symbol.asyncIterator]?: () => AsyncIterator<Buffer | string> }) {
  const directBody = request.body

  if (directBody && typeof directBody === 'object' && !Buffer.isBuffer(directBody)) {
    return directBody as T
  }

  if (typeof directBody === 'string') {
    return JSON.parse(directBody) as T
  }

  if (Buffer.isBuffer(directBody)) {
    return JSON.parse(directBody.toString('utf8')) as T
  }

  if (request[Symbol.asyncIterator]) {
    const chunks: Uint8Array[] = []

    for await (const chunk of request as AsyncIterable<Buffer | string>) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }

    if (!chunks.length) {
      return {} as T
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  }

  return {} as T
}

function toSafeHttpError(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof error.status === 'number' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error as { status: number; message: string }
  }

  return {
    status: 500,
    message:
      error instanceof Error ? error.message : 'Unexpected match service error.',
  }
}

export const config = {
  runtime: 'nodejs',
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed.' })
    return
  }

  try {
    const body = await readJsonRequestBody<MatchFinalizeRequest>(request)
    const { finalizeMatchServer } = await import('../_server/matchApi.js')
    const payload = await finalizeMatchServer(body)
    response.status(200).json(payload)
  } catch (error) {
    const httpError = toSafeHttpError(error)
    response.status(httpError.status).json({ error: httpError.message })
  }
}
