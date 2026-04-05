import { readJsonRequestBody } from '../_utils.ts'

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
    const { finalizeMatchServer } = await import('../_server/matchApi.ts')
    const payload = await finalizeMatchServer(body)
    response.status(200).json(payload)
  } catch (error) {
    const httpError = toSafeHttpError(error)
    response.status(httpError.status).json({ error: httpError.message })
  }
}
