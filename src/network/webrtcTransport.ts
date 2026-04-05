import { joinRoom, type ActionSender, type Room } from 'trystero/torrent'
import type { PilotId } from '../game/types'
import type { MatchTransport, TransportEvent, TransportStatus } from './types'

export function createWebrtcTransport(): MatchTransport {
  let room: Room | null = null
  let pilotId: PilotId | null = null
  let status: TransportStatus = 'idle'
  let onEvent: ((event: TransportEvent) => void) | null = null
  let sendAction: ActionSender<string> | null = null

  return {
    kind: 'webrtc',
    get status() {
      return status
    },
    connect(roomCode, nextPilotId, handleEvent) {
      pilotId = nextPilotId
      onEvent = handleEvent

      try {
        room = joinRoom({ appId: 'astrofightxyz' }, roomCode)
        const [send, getMessage] = room.makeAction<string>('game-event')
        sendAction = send

        status = 'connected'

        room.onPeerJoin(() => {
          void sendAction?.(JSON.stringify({ type: 'peer-joined', pilotId: nextPilotId }))
        })

        room.onPeerLeave(() => {
          const remotePilotId = pilotId === 'blue' ? 'violet' : 'blue'
          onEvent?.({ type: 'peer-left', pilotId: remotePilotId })
        })

        getMessage((data) => {
          try {
            onEvent?.(JSON.parse(data) as TransportEvent)
          } catch (error) {
            console.error('Received invalid AstroFight WebRTC payload.', error)
          }
        })
      } catch (error) {
        console.error('Failed to connect AstroFight WebRTC transport.', error)
        status = 'disconnected'
      }
    },
    send(event) {
      if (sendAction && status === 'connected') {
        void sendAction(JSON.stringify(event))
      }
    },
    disconnect() {
      if (room) {
        room.leave()
      }
      room = null
      sendAction = null
      pilotId = null
      onEvent = null
      status = 'disconnected'
    },
  }
}
