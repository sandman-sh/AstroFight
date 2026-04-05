type BodyCapableRequest = {
  body?: unknown
  on?: (event: string, listener: (chunk: Buffer | string) => void) => void
  [Symbol.asyncIterator]?: () => AsyncIterator<Buffer | string>
}

export async function readJsonRequestBody<T>(request: BodyCapableRequest): Promise<T> {
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
