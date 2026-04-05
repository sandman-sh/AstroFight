import type { PilotId } from '../game/types'
import type { MatchTransport, TransportEvent, TransportStatus } from './types'

interface BroadcastMessage {
  sender: PilotId
  event: TransportEvent
}

export function createBroadcastTransport(): MatchTransport {
  let channel: BroadcastChannel | null = null
  let pilotId: PilotId | null = null
  let status: TransportStatus = 'idle'
  let onEvent: ((event: TransportEvent) => void) | null = null
  let unloadHandler: (() => void) | null = null

  return {
    kind: 'broadcast',
    get status() {
      return status
    },
    connect(roomCode, nextPilotId, handleEvent) {
      pilotId = nextPilotId
      onEvent = handleEvent
      channel = new BroadcastChannel(`astrofight:${roomCode}`)
      status = 'connected'

      channel.onmessage = (message: MessageEvent<BroadcastMessage>) => {
        if (!pilotId || message.data.sender === pilotId) return
        onEvent?.(message.data.event)
      }

      unloadHandler = () => {
        if (!pilotId) return
        channel?.postMessage({
          sender: pilotId,
          event: { type: 'peer-left', pilotId },
        } satisfies BroadcastMessage)
      }

      window.addEventListener('beforeunload', unloadHandler)

      channel.postMessage({
        sender: nextPilotId,
        event: { type: 'peer-joined', pilotId: nextPilotId },
      } satisfies BroadcastMessage)
    },
    send(event) {
      if (!channel || !pilotId) return
      channel.postMessage({
        sender: pilotId,
        event,
      } satisfies BroadcastMessage)
    },
    disconnect() {
      if (unloadHandler) {
        window.removeEventListener('beforeunload', unloadHandler)
      }
      if (channel && pilotId) {
        channel.postMessage({
          sender: pilotId,
          event: { type: 'peer-left', pilotId },
        } satisfies BroadcastMessage)
      }
      channel?.close()
      channel = null
      pilotId = null
      onEvent = null
      status = 'disconnected'
    },
  }
}
