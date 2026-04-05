import {
  ARENA_RADIUS,
  FIRE_COOLDOWN,
  LASER_DAMAGE,
  LASER_SPEED,
  MATCH_DURATION_SECONDS,
  MIN_SHIP_SEPARATION,
  MAX_BOOST,
  PILOT_META,
  SHIP_RADIUS,
  SNAPSHOT_INTERVAL_MS,
  SPACE_OBSTACLES,
} from '../config/game'
import type { MatchTransport } from '../network/types'
import { useGameStore } from './store'
import type {
  InputState,
  PilotId,
  ProjectileState,
  SnapshotPayload,
  Vector3Tuple,
} from './types'

const zeroInput: InputState = {
  moveX: 0,
  moveY: 0,
  aim: { x: 0, y: 0 },
  firing: false,
  boosting: false,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function length2D(x: number, z: number) {
  return Math.sqrt(x * x + z * z)
}

function normalize2D(x: number, z: number) {
  const length = length2D(x, z)
  if (!length) return [0, 0] as const
  return [x / length, z / length] as const
}

function distance(a: Vector3Tuple, b: Vector3Tuple) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function distance2D(a: Vector3Tuple, b: Vector3Tuple) {
  const dx = a[0] - b[0]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dz * dz)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function lerpVec3(a: Vector3Tuple, b: Vector3Tuple, t: number): Vector3Tuple {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function getOpposingPilotId(pilotId: PilotId): PilotId {
  return pilotId === 'blue' ? 'violet' : 'blue'
}

function getForwardVector(rotation: number) {
  return [Math.sin(rotation), Math.cos(rotation)] as const
}

function getRightVector(rotation: number) {
  return [-Math.cos(rotation), Math.sin(rotation)] as const
}

function getAimRotation(input: InputState, pilotId: PilotId) {
  const baseRotation = pilotId === 'blue' ? 0 : Math.PI
  return baseRotation + clamp(input.aim.x * 1.18, -1.28, 1.28)
}

function resolveArenaObstacles(
  position: Vector3Tuple,
  shipRadius = SHIP_RADIUS,
): Vector3Tuple {
  let resolved: Vector3Tuple = [...position]

  for (const obstacle of SPACE_OBSTACLES) {
    const dx = resolved[0] - obstacle.position[0]
    const dz = resolved[2] - obstacle.position[2]
    const distanceFromObstacle = Math.sqrt(dx * dx + dz * dz)
    const minimumDistance = obstacle.radius + shipRadius

    if (distanceFromObstacle < minimumDistance) {
      const safeDistance = distanceFromObstacle || 0.001
      const pushX = dx / safeDistance
      const pushZ = dz / safeDistance

      resolved = [
        obstacle.position[0] + pushX * minimumDistance,
        resolved[1],
        obstacle.position[2] + pushZ * minimumDistance,
      ]
    }
  }

  resolved[0] = clamp(resolved[0], -ARENA_RADIUS, ARENA_RADIUS)
  resolved[2] = clamp(resolved[2], -ARENA_RADIUS, ARENA_RADIUS)

  return resolved
}

function separateShips(
  localPosition: Vector3Tuple,
  remotePosition: Vector3Tuple,
): Vector3Tuple {
  const dx = localPosition[0] - remotePosition[0]
  const dz = localPosition[2] - remotePosition[2]
  const spacing = Math.sqrt(dx * dx + dz * dz)

  if (spacing >= MIN_SHIP_SEPARATION) {
    return localPosition
  }

  const safeDistance = spacing || 0.001
  const pushX = dx / safeDistance
  const pushZ = dz / safeDistance

  return [
    remotePosition[0] + pushX * MIN_SHIP_SEPARATION,
    localPosition[1],
    remotePosition[2] + pushZ * MIN_SHIP_SEPARATION,
  ]
}

function makeProjectile(
  pilotId: PilotId,
  rotation: number,
  position: Vector3Tuple,
  authoritative: boolean,
): ProjectileState {
  const [directionX, directionZ] = getForwardVector(rotation)
  const muzzleOffset = 3.1

  return {
    id: `${pilotId}-${Math.random().toString(36).slice(2, 8)}`,
    ownerId: pilotId,
    authoritative,
    position: [
      position[0] + directionX * muzzleOffset,
      position[1] + 0.35,
      position[2] + directionZ * muzzleOffset,
    ],
    velocity: [directionX * LASER_SPEED, 0, directionZ * LASER_SPEED],
    life: 1.95,
  }
}

function buildSnapshot(pilotId: PilotId): SnapshotPayload {
  const state = useGameStore.getState()
  const pilot = state.pilots[pilotId]

  return {
    pilotId,
    position: pilot.position,
    velocity: pilot.velocity,
    rotation: pilot.rotation,
    health: pilot.health,
    shield: pilot.shield,
    boost: pilot.boost,
    connected: pilot.connected,
  }
}

function updateBot(delta: number, localPilotId: PilotId) {
  const store = useGameStore.getState()
  const botId = getOpposingPilotId(localPilotId)
  const bot = store.pilots[botId]
  const target = store.pilots[localPilotId]

  if (!bot.isBot || store.stage !== 'battle') return

  const offsetX = target.position[0] - bot.position[0]
  const offsetZ = target.position[2] - bot.position[2]
  const [dirX, dirZ] = normalize2D(offsetX, offsetZ)
  const distanceToTarget = distance(bot.position, target.position)
  const strafePhase = performance.now() / 520
  const lateralBias = Math.sin(strafePhase) > 0 ? 1 : -1
  const [rightX, rightZ] = [-dirZ * lateralBias, dirX * lateralBias]
  const preferredRange = 18.5
  const retreatRange = 12.5
  const rangeError = distanceToTarget - preferredRange
  const approachForce = clamp(rangeError * 0.62, -3.4, 3.4)
  const retreatForce =
    distanceToTarget < retreatRange ? clamp((retreatRange - distanceToTarget) * 1.4, 0, 8.4) : 0
  const strafeForce = 5.8

  const velocityX = clamp(dirX * (approachForce - retreatForce) + rightX * strafeForce, -8.5, 8.5)
  const velocityZ = clamp(dirZ * (approachForce - retreatForce) + rightZ * strafeForce, -8.5, 8.5)
  const nextPosition: Vector3Tuple = [
    clamp(bot.position[0] + velocityX * delta, -ARENA_RADIUS, ARENA_RADIUS),
    0,
    clamp(bot.position[2] + velocityZ * delta, -ARENA_RADIUS, ARENA_RADIUS),
  ]
  const resolvedPosition = resolveArenaObstacles(
    separateShips(resolveArenaObstacles(nextPosition), target.position),
  )

  const nextRotation = Math.atan2(offsetX, offsetZ)

  store.setPilotTransform(botId, {
    position: resolvedPosition,
    velocity: [velocityX, 0, velocityZ],
    rotation: nextRotation,
    targetRotation: nextRotation,
    boost: clamp(bot.boost + delta * 10, 0, MAX_BOOST),
    cooldown: Math.max(0, bot.cooldown - delta),
  })

  const shouldFire =
    distance(resolvedPosition, target.position) < 24 &&
    store.pilots[botId].cooldown <= 0

  if (shouldFire) {
    const projectile = makeProjectile(botId, nextRotation, resolvedPosition, true)
    store.pushProjectile(projectile)
    store.pushEffect({
      id: `muzzle-${projectile.id}`,
      kind: 'impact',
      position: projectile.position,
      age: 0,
      maxAge: 0.18,
      color: '#ef4444',
    })
    store.setPilotTransform(botId, { cooldown: FIRE_COOLDOWN })
  }
}

export function receiveRemoteProjectile(projectile: ProjectileState) {
  const localPilotId = useGameStore.getState().localPilotId
  const authoritative = projectile.ownerId === localPilotId ? true : false

  useGameStore.getState().pushProjectile({
    ...projectile,
    authoritative,
  })
}

export function triggerCountdown(transport?: MatchTransport | null) {
  const startsAt = performance.now() + 3200
  useGameStore.getState().startCountdown(startsAt)
  transport?.send({ type: 'countdown', startsAt })
}

export function stepSimulation(
  delta: number,
  input: InputState = zeroInput,
  transport?: MatchTransport | null,
) {
  const store = useGameStore.getState()
  const {
    localPilotId,
    mode,
    pilots,
    stage,
    result,
    countdownEndsAt,
    lastSnapshotSentAt,
  } = store

  const remotePilotId = getOpposingPilotId(localPilotId)
  const localPilot = pilots[localPilotId]
  const remotePilot = pilots[remotePilotId]
  const now = performance.now()

  if (stage === 'countdown' && countdownEndsAt) {
    const secondsLeft = Math.max(0, countdownEndsAt - now)
    store.setTimerLeft(MATCH_DURATION_SECONDS)
    useGameStore.setState({
      countdownValue: Math.max(0, Math.ceil(secondsLeft / 1000)),
    })

    if (secondsLeft <= 0) {
      store.startBattle()
    }
    return
  }

  if (stage !== 'battle') return

  if (mode === 'bot') {
    updateBot(delta, localPilotId)
  } else {
    store.setPilotTransform(remotePilotId, {
      position: lerpVec3(remotePilot.position, remotePilot.targetPosition, 0.14),
      rotation: lerp(remotePilot.rotation, remotePilot.targetRotation, 0.14),
      cooldown: Math.max(0, remotePilot.cooldown - delta),
    })
  }

  const desiredRotation = getAimRotation(input, localPilotId)
  const [forwardX, forwardZ] = getForwardVector(desiredRotation)
  const [rightX, rightZ] = getRightVector(desiredRotation)
  const boostMultiplier =
    input.boosting && localPilot.boost > 6
      ? 1.9
      : 1
  const forwardForce = input.moveY * 17 * boostMultiplier
  const strafeForce = input.moveX * 14 * boostMultiplier
  const desiredVelocityX = forwardX * forwardForce + rightX * strafeForce
  const desiredVelocityZ = forwardZ * forwardForce + rightZ * strafeForce
  const damping = input.moveX === 0 && input.moveY === 0 ? 0.84 : 0.92
  const nextVelocityX = clamp(
    lerp(localPilot.velocity[0], desiredVelocityX, delta * 5.8) * damping,
    -13,
    13,
  )
  const nextVelocityZ = clamp(
    lerp(localPilot.velocity[2], desiredVelocityZ, delta * 5.8) * damping,
    -13,
    13,
  )

  const nextPosition: Vector3Tuple = [
    clamp(localPilot.position[0] + nextVelocityX * delta, -ARENA_RADIUS, ARENA_RADIUS),
    0,
    clamp(localPilot.position[2] + nextVelocityZ * delta, -ARENA_RADIUS, ARENA_RADIUS),
  ]
  const resolvedPosition = resolveArenaObstacles(
    separateShips(resolveArenaObstacles(nextPosition), remotePilot.position),
  )
  const distanceToRemote = distance(resolvedPosition, remotePilot.position)
  const backedOffPosition =
    distanceToRemote < 11.5
      ? separateShips(resolvedPosition, remotePilot.position)
      : resolvedPosition

  const nextBoost = clamp(
    localPilot.boost +
      (input.boosting ? -42 : 24) * delta,
    0,
    MAX_BOOST,
  )

  const nextCooldown = Math.max(0, localPilot.cooldown - delta)

  store.setPilotTransform(localPilotId, {
    position: backedOffPosition,
    velocity: [nextVelocityX, 0, nextVelocityZ],
    rotation: lerp(localPilot.rotation, desiredRotation, 0.34),
    targetRotation: desiredRotation,
    boost: nextBoost,
    cooldown: nextCooldown,
  })

  if (input.firing && nextCooldown <= 0) {
    const projectile = makeProjectile(
      localPilotId,
      desiredRotation,
      backedOffPosition,
      true,
    )
    store.pushProjectile(projectile)
    store.pushEffect({
      id: `muzzle-${projectile.id}`,
      kind: 'impact',
      position: projectile.position,
      age: 0,
      maxAge: 0.18,
      color: localPilotId === 'blue' ? '#34d399' : '#ef4444',
    })
    store.setPilotTransform(localPilotId, { cooldown: FIRE_COOLDOWN })
    transport?.send({ type: 'shot', projectile })
  }

  const currentProjectiles = useGameStore.getState().projectiles
  const nextProjectiles: ProjectileState[] = []

  for (const projectile of currentProjectiles) {
    const updatedProjectile: ProjectileState = {
      ...projectile,
      life: projectile.life - delta,
      position: [
        projectile.position[0] + projectile.velocity[0] * delta,
        projectile.position[1],
        projectile.position[2] + projectile.velocity[2] * delta,
      ],
    }

    if (updatedProjectile.life <= 0) continue

    const targetId = getOpposingPilotId(updatedProjectile.ownerId)
    const targetPilot = useGameStore.getState().pilots[targetId]
    const collisionDistance = distance(updatedProjectile.position, targetPilot.position)
    const obstacleHit = SPACE_OBSTACLES.some(
      (obstacle) =>
        distance2D(updatedProjectile.position, obstacle.position) <= obstacle.radius + 0.18,
    )

    if (obstacleHit) {
      store.pushEffect({
        id: `rock-hit-${updatedProjectile.id}`,
        kind: 'impact',
        position: updatedProjectile.position,
        age: 0,
        maxAge: 0.35,
        color: getPilotAccent(updatedProjectile.ownerId),
      })
      continue
    }

    const shouldResolveHit =
      updatedProjectile.authoritative && collisionDistance <= SHIP_RADIUS * 1.25

    if (shouldResolveHit) {
      store.applyDamage(targetId, LASER_DAMAGE, updatedProjectile.position)

      if (targetPilot.isBot) {
        const refreshedTarget = useGameStore.getState().pilots[targetId]
        if (refreshedTarget.health <= 0) {
          store.endMatch(updatedProjectile.ownerId, 'hp')
        }
      } else {
        transport?.send({
          type: 'damage',
          targetId,
          amount: LASER_DAMAGE,
          position: updatedProjectile.position,
          from: updatedProjectile.ownerId,
        })
      }
      continue
    }

    nextProjectiles.push(updatedProjectile)
  }

  const currentEffects = useGameStore.getState().effects
  const nextEffects = currentEffects
    .map((effect) => ({ ...effect, age: effect.age + delta }))
    .filter((effect) => effect.age < effect.maxAge)

  store.setProjectiles(nextProjectiles)
  store.setEffects(nextEffects)

  const startedAt = useGameStore.getState().matchStartedAt ?? now
  const remaining = Math.max(
    0,
    MATCH_DURATION_SECONDS - (now - startedAt) / 1000,
  )
  store.setTimerLeft(remaining)

  if (useGameStore.getState().result.winnerId) {
    const winnerId = useGameStore.getState().result.winnerId!
    store.endMatch(winnerId, result.reason ?? 'hp')
    transport?.send({
      type: 'match-end',
      winnerId,
      reason: result.reason ?? 'hp',
    })
    return
  }

  if (remaining <= 0) {
    const currentState = useGameStore.getState()
    const winnerId =
      currentState.pilots.blue.health >= currentState.pilots.violet.health
        ? 'blue'
        : 'violet'
    store.endMatch(winnerId, 'timeout')
    transport?.send({
      type: 'match-end',
      winnerId,
      reason: 'timeout',
    })
    return
  }

  if (transport && now - lastSnapshotSentAt >= SNAPSHOT_INTERVAL_MS) {
    transport.send({
      type: 'snapshot',
      payload: buildSnapshot(localPilotId),
    })
    store.setLastSnapshotSentAt(now)
  }
}

export function markDisconnectWin(pilotId: PilotId, transport?: MatchTransport | null) {
  const winnerId = getOpposingPilotId(pilotId)
  useGameStore.getState().endMatch(winnerId, 'disconnect')
  transport?.send({ type: 'match-end', winnerId, reason: 'disconnect' })
}

export function getPilotAccent(pilotId: PilotId) {
  return PILOT_META[pilotId].accent
}
