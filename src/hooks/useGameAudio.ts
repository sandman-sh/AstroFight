import { useEffect, useRef } from 'react'
import { useGameStore } from '../game/store'

const BACKGROUND_MUSIC_VOLUME = 0.18
const LASER_VOLUME = 0.42
const EXPLOSION_VOLUME = 0.52

function createAudio(src: string, volume: number, loop = false) {
  const audio = new Audio(src)
  audio.preload = 'none'
  audio.volume = volume
  audio.loop = loop
  return audio
}

export function useGameAudio() {
  const projectileCount = useGameStore((state) => state.projectiles.length)
  const stage = useGameStore((state) => state.stage)
  const winnerId = useGameStore((state) => state.result.winnerId)

  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null)
  const laserRef = useRef<HTMLAudioElement | null>(null)
  const explosionRef = useRef<HTMLAudioElement | null>(null)
  const unlockedRef = useRef(false)
  const previousProjectileCountRef = useRef(projectileCount)
  const previousStageRef = useRef(stage)

  useEffect(() => {
    const unlockAudio = () => {
      if (unlockedRef.current) return

      unlockedRef.current = true
      if (!backgroundMusicRef.current) {
        backgroundMusicRef.current = createAudio(
          '/audio/bgmusic.mp3',
          BACKGROUND_MUSIC_VOLUME,
          true,
        )
      }

      const backgroundMusic = backgroundMusicRef.current

      void backgroundMusic.play().catch(() => {
        unlockedRef.current = false
      })
    }

    const handleVisibilityChange = () => {
      const backgroundMusic = backgroundMusicRef.current
      if (!backgroundMusic) return

      if (document.hidden) {
        backgroundMusic.pause()
        return
      }

      if (unlockedRef.current) {
        void backgroundMusic.play().catch(() => {
          // Ignore autoplay resume failures.
        })
      }
    }

    window.addEventListener('pointerdown', unlockAudio, { once: true })
    window.addEventListener('keydown', unlockAudio, { once: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      backgroundMusicRef.current?.pause()
      backgroundMusicRef.current = null
      laserRef.current = null
      explosionRef.current = null
      unlockedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!unlockedRef.current) {
      previousProjectileCountRef.current = projectileCount
      return
    }

    if (projectileCount > previousProjectileCountRef.current) {
      if (!laserRef.current) {
        laserRef.current = createAudio('/audio/lasershoot.mp3', LASER_VOLUME)
      }

      const laser = laserRef.current
      if (laser) {
        const shot = laser.cloneNode(true) as HTMLAudioElement
        shot.volume = LASER_VOLUME
        void shot.play().catch(() => {
          // Ignore browser playback edge cases.
        })
      }
    }

    previousProjectileCountRef.current = projectileCount
  }, [projectileCount])

  useEffect(() => {
    if (!unlockedRef.current) {
      previousStageRef.current = stage
      return
    }

    if (stage === 'finished' && previousStageRef.current !== 'finished' && winnerId) {
      if (!explosionRef.current) {
        explosionRef.current = createAudio('/audio/explosion.mp3', EXPLOSION_VOLUME)
      }

      const explosion = explosionRef.current
      if (explosion) {
        explosion.currentTime = 0
        void explosion.play().catch(() => {
          // Ignore browser playback edge cases.
        })
      }
    }

    previousStageRef.current = stage
  }, [stage, winnerId])
}
