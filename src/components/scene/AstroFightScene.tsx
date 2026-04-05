import { Suspense, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Environment,
  Float,
  PerspectiveCamera,
  Ring,
  Stars,
  useGLTF,
} from '@react-three/drei'
import * as THREE from 'three'
import { SPACE_OBSTACLES } from '../../config/game'
import { useGameStore } from '../../game/store'
import { getPilotAccent, stepSimulation } from '../../game/engine'
import type { InputState, PilotState, ProjectileState } from '../../game/types'
import type { MatchTransport } from '../../network/types'

interface AstroFightSceneProps {
  input: InputState
  transport: MatchTransport | null
}

const SHIP_MODEL_CONFIG = {
  blue: {
    url: '/models/spaceship1.glb',
    targetSize: 4.3,
    modelRotation: [0, -Math.PI / 2, 0] as [number, number, number],
    exhaustOffset: -1.9,
    modelOffset: [0, 0, 0] as [number, number, number],
  },
  violet: {
    url: '/models/spaceship2.glb',
    targetSize: 4.1,
    modelRotation: [0, Math.PI / 2, 0] as [number, number, number],
    exhaustOffset: -1.8,
    modelOffset: [0, 0, 0] as [number, number, number],
  },
} as const

function styleShipMaterial(material: THREE.Material) {
  const cloned = material.clone()
  const standardLike = cloned as THREE.MeshStandardMaterial

  if ('map' in standardLike && standardLike.map) {
    standardLike.map.colorSpace = THREE.SRGBColorSpace
    standardLike.map.needsUpdate = true
  }
  if ('emissiveMap' in standardLike && standardLike.emissiveMap) {
    standardLike.emissiveMap.colorSpace = THREE.SRGBColorSpace
    standardLike.emissiveMap.needsUpdate = true
  }
  if ('metalness' in standardLike && typeof standardLike.metalness === 'number') {
    standardLike.metalness = Math.min(standardLike.metalness, 0.88)
  }
  if ('roughness' in standardLike && typeof standardLike.roughness === 'number') {
    standardLike.roughness = Math.min(standardLike.roughness, 0.9)
  }
  standardLike.needsUpdate = true

  return cloned
}

function ShipHull({ pilot }: { pilot: PilotState }) {
  const config = SHIP_MODEL_CONFIG[pilot.id]
  const gltf = useGLTF(config.url)

  const ship = useMemo(() => {
    const clone = gltf.scene.clone(true)
    const previewGroup = new THREE.Group()
    const rotationEuler = new THREE.Euler(...config.modelRotation)
    const inverseRotation = new THREE.Quaternion()
      .setFromEuler(rotationEuler)
      .invert()

    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (Array.isArray(child.material)) {
          child.material = child.material.map((material) =>
            styleShipMaterial(material),
          )
        } else if (child.material) {
          child.material = styleShipMaterial(child.material)
        }
      }
    })

    previewGroup.rotation.copy(rotationEuler)
    previewGroup.add(clone)
    previewGroup.updateMatrixWorld(true)

    let box = new THREE.Box3().setFromObject(previewGroup)
    const size = box.getSize(new THREE.Vector3())
    const scale = config.targetSize / Math.max(size.x, size.y, size.z, 0.001)

    clone.scale.setScalar(scale)
    previewGroup.updateMatrixWorld(true)

    box = new THREE.Box3().setFromObject(previewGroup)
    const center = box.getCenter(new THREE.Vector3())
    const worldCorrection = new THREE.Vector3(-center.x, -center.y, -center.z)
    const localCorrection = worldCorrection.applyQuaternion(inverseRotation)

    clone.position.copy(localCorrection)
    clone.position.x += config.modelOffset[0]
    clone.position.y += config.modelOffset[1]
    clone.position.z += config.modelOffset[2]

    previewGroup.remove(clone)

    return clone
  }, [config.modelOffset, config.modelRotation, config.targetSize, gltf.scene])

  return (
    <group rotation={config.modelRotation}>
      <primitive object={ship} dispose={null} />
    </group>
  )
}

function CameraRig() {
  const camera = useThree((state) => state.camera)
  const localPilotId = useGameStore((state) => state.localPilotId)
  const localPilot = useGameStore((state) => state.pilots[localPilotId])

  useFrame((_state, delta) => {
    const behind = new THREE.Vector3(
      Math.sin(localPilot.rotation) * -7.8,
      4.4,
      Math.cos(localPilot.rotation) * -7.8,
    )
    const target = new THREE.Vector3(
      localPilot.position[0],
      localPilot.position[1] + 0.9,
      localPilot.position[2],
    )
    const desired = new THREE.Vector3(
      localPilot.position[0],
      localPilot.position[1],
      localPilot.position[2],
    ).add(behind)

    camera.position.lerp(desired, 1 - Math.exp(-delta * 5))
    camera.lookAt(target)
  })

  return null
}

function Arena() {
  const starDust = useMemo(
    () =>
      Array.from({ length: 80 }, (_, index) => ({
        id: index,
        position: [
          Math.sin(index * 0.9) * (10 + (index % 10) * 2.4),
          ((index % 7) - 3) * 0.55,
          Math.cos(index * 1.3) * (12 + (index % 9) * 2.2),
        ] as [number, number, number],
      })),
    [],
  )

  return (
    <>
      <Environment preset="night" />
      <Stars radius={220} depth={120} count={10000} factor={4.6} fade />
      <ambientLight intensity={0.72} />
      <hemisphereLight
        args={['#dbeafe', '#020617', 1.05]}
        position={[0, 18, 0]}
      />
      <directionalLight position={[6, 14, 10]} intensity={1.85} color="#dbeafe" />
      <pointLight position={[-14, 8, -12]} intensity={24} color="#60a5fa" />
      <pointLight position={[15, 6, 10]} intensity={18} color="#a78bfa" />
      <pointLight position={[0, 5, -20]} intensity={12} color="#ffffff" />

      <mesh position={[0, 20, -48]}>
        <sphereGeometry args={[24, 40, 40]} />
        <meshBasicMaterial color="#1d4ed8" transparent opacity={0.08} />
      </mesh>
      <mesh position={[24, -8, -42]}>
        <sphereGeometry args={[16, 36, 36]} />
        <meshBasicMaterial color="#6d28d9" transparent opacity={0.07} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.82, 0]}>
        <ringGeometry args={[15.5, 25.5, 80]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.12} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.76, 0]}>
        <ringGeometry args={[20.8, 21.05, 96]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.16} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.75, 0]}>
        <ringGeometry args={[11.2, 11.45, 96]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.16} />
      </mesh>

      {SPACE_OBSTACLES.map((obstacle) =>
        obstacle.kind === 'planet' ? (
          <group key={obstacle.id} position={obstacle.position}>
            <mesh>
              <sphereGeometry args={[obstacle.radius, 42, 42]} />
              <meshStandardMaterial
                color={obstacle.tint}
                emissive={obstacle.tint}
                emissiveIntensity={0.16}
                metalness={0.08}
                roughness={0.92}
              />
            </mesh>
            <mesh scale={[1.16, 1.16, 1.16]}>
              <sphereGeometry args={[obstacle.radius, 36, 36]} />
              <meshBasicMaterial color={obstacle.tint} transparent opacity={0.07} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0.4, 0]}>
              <ringGeometry args={[obstacle.radius * 1.35, obstacle.radius * 1.72, 72]} />
              <meshBasicMaterial color={obstacle.tint} transparent opacity={0.18} />
            </mesh>
          </group>
        ) : (
          <Float
            key={obstacle.id}
            speed={0.7}
            rotationIntensity={0.35}
            floatIntensity={0.55}
          >
            <mesh position={obstacle.position} scale={obstacle.radius / 1.35}>
              <icosahedronGeometry args={[1.45, 1]} />
              <meshStandardMaterial
                color={obstacle.tint}
                emissive="#0b1120"
                emissiveIntensity={0.22}
                roughness={0.9}
                metalness={0.08}
              />
            </mesh>
          </Float>
        ),
      )}

      {starDust.map((dust) => (
        <mesh key={dust.id} position={dust.position}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial color="#dbeafe" transparent opacity={0.35} />
        </mesh>
      ))}
    </>
  )
}

function Ship({ pilot }: { pilot: PilotState }) {
  const accent = getPilotAccent(pilot.id)
  const { exhaustOffset } = SHIP_MODEL_CONFIG[pilot.id]

  return (
    <group position={pilot.position} rotation={[0, pilot.rotation, 0]}>
      <Suspense fallback={null}>
        <ShipHull pilot={pilot} />
      </Suspense>

      <mesh position={[0.34, 0.18, exhaustOffset]}>
        <sphereGeometry args={[0.18, 18, 18]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.88}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[-0.34, 0.18, exhaustOffset]}>
        <sphereGeometry args={[0.18, 18, 18]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.88}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {pilot.boost > 8 ? (
        <>
          <mesh
            position={[0.34, 0.18, exhaustOffset - 0.34]}
            scale={[0.9, 0.9, 1 + pilot.boost / 100]}
          >
            <coneGeometry args={[0.13, 0.85, 12]} />
            <meshBasicMaterial
              color={accent}
              transparent
              opacity={0.46}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh
            position={[-0.34, 0.18, exhaustOffset - 0.34]}
            scale={[0.9, 0.9, 1 + pilot.boost / 100]}
          >
            <coneGeometry args={[0.13, 0.85, 12]} />
            <meshBasicMaterial
              color={accent}
              transparent
              opacity={0.46}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </>
      ) : null}

    </group>
  )
}

function Laser({ projectile }: { projectile: ProjectileState }) {
  const localPilotId = useGameStore((state) => state.localPilotId)
  const accent = projectile.ownerId === localPilotId ? '#34d399' : '#ef4444'
  const glow = projectile.ownerId === localPilotId ? '#86efac' : '#fca5a5'
  const yaw = Math.atan2(projectile.velocity[0], projectile.velocity[2])

  return (
    <group position={projectile.position} rotation={[0, yaw, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 4.8, 12]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.98}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 5.6, 12]} />
        <meshBasicMaterial
          color={glow}
          transparent
          opacity={0.4}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[0, 0, 2.2]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}

function Projectiles() {
  const projectiles = useGameStore((state) => state.projectiles)

  return (
    <>
      {projectiles.map((projectile) => (
        <Laser key={projectile.id} projectile={projectile} />
      ))}
    </>
  )
}

function Effects() {
  const effects = useGameStore((state) => state.effects)

  return (
    <>
      {effects.map((effect) => {
        const progress = 1 - effect.age / effect.maxAge
        const scale =
          effect.kind === 'burst'
            ? 2.5 + (1 - progress) * 9
            : 0.9 + (1 - progress) * 2.1

        return (
          <group key={effect.id} position={effect.position}>
            <Ring
              args={[0.35, 0.72, 32]}
              scale={scale}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <meshBasicMaterial
                color={effect.color}
                transparent
                opacity={progress * (effect.kind === 'burst' ? 0.52 : 0.88)}
              />
            </Ring>
            <mesh scale={scale * 0.22}>
              <sphereGeometry args={[1, 24, 24]} />
              <meshBasicMaterial
                color={effect.color}
                transparent
                opacity={progress * 0.18}
              />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

function SceneStep({ input, transport }: AstroFightSceneProps) {
  const pilots = useGameStore((state) => state.pilots)
  const localPilotId = useGameStore((state) => state.localPilotId)
  const localPilot = pilots[localPilotId]
  const remotePilot = pilots[localPilotId === 'blue' ? 'violet' : 'blue']

  useFrame((_state, delta) => {
    stepSimulation(Math.min(delta, 0.033), input, transport)
  })

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 5.8, -20]} fov={52} />
      <CameraRig />
      <Arena />
      <Ship pilot={localPilot} />
      <Ship pilot={remotePilot} />
      <Projectiles />
      <Effects />
    </>
  )
}

export function AstroFightScene({ input, transport }: AstroFightSceneProps) {
  return (
    <Canvas
      shadows
      gl={{ antialias: true }}
      dpr={[1, 1.75]}
      camera={{ position: [0, 5.8, -20], fov: 52 }}
    >
      <color attach="background" args={['#04060c']} />
      <fog attach="fog" args={['#04060c', 16, 92]} />
      <SceneStep input={input} transport={transport} />
    </Canvas>
  )
}

useGLTF.preload('/models/spaceship1.glb')
useGLTF.preload('/models/spaceship2.glb')
