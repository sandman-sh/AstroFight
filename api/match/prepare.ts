import {
  prepareMatchStateServer,
  toHttpError,
  type MatchPrepareRequest,
} from '../../server/matchApi'
import { readJsonRequestBody } from '../_utils'

type ApiRequest = {
  method?: string
  body?: MatchPrepareRequest
}

type ApiResponse = {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
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
    const body = await readJsonRequestBody<MatchPrepareRequest>(request)
    const payload = await prepareMatchStateServer(body)
    response.status(200).json(payload)
  } catch (error) {
    const httpError = toHttpError(error)
    response.status(httpError.status).json({ error: httpError.message })
  }
}
