import {
  prepareMatchStateServer,
  toHttpError,
  type MatchPrepareRequest,
} from '../../server/matchApi'

type ApiRequest = {
  method?: string
  body?: MatchPrepareRequest
}

type ApiResponse = {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed.' })
    return
  }

  try {
    const payload = await prepareMatchStateServer(request.body ?? ({} as MatchPrepareRequest))
    response.status(200).json(payload)
  } catch (error) {
    const httpError = toHttpError(error)
    response.status(httpError.status).json({ error: httpError.message })
  }
}
