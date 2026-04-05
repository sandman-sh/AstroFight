import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { InputState } from '../game/types'

const defaultInput: InputState = {
  moveX: 0,
  moveY: 0,
  aim: { x: 0, y: 1 },
  firing: false,
  boosting: false,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()

  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  )
}

export function useGameInput() {
  const [input, setInput] = useState<InputState>(defaultInput)
  const firingWithMouse = useRef(false)
  const keys = useRef({
    w: false,
    a: false,
    s: false,
    d: false,
    arrowup: false,
    arrowleft: false,
    arrowdown: false,
    arrowright: false,
    shift: false,
    space: false,
  })

  const updateMovement = useMemo(
    () => () => {
      const moveX =
        (keys.current.d || keys.current.arrowright ? 1 : 0) -
        (keys.current.a || keys.current.arrowleft ? 1 : 0)
      const moveY =
        (keys.current.w || keys.current.arrowup ? 1 : 0) -
        (keys.current.s || keys.current.arrowdown ? 1 : 0)
      setInput((state) => ({
        ...state,
        moveX,
        moveY,
        boosting: keys.current.shift,
        firing: keys.current.space || firingWithMouse.current,
      }))
    },
    [],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return
      }

      const key = event.key.toLowerCase()
      const code = event.code
      if (
        key === 'w' ||
        key === 'a' ||
        key === 's' ||
        key === 'd' ||
        key === 'arrowup' ||
        key === 'arrowleft' ||
        key === 'arrowdown' ||
        key === 'arrowright'
      ) {
        event.preventDefault()
        keys.current[key] = true
      }
      if (key === 'shift') {
        keys.current.shift = true
      }
      if (key === ' ' || code === 'Space') {
        event.preventDefault()
        keys.current.space = true
      }
      updateMovement()
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return
      }

      const key = event.key.toLowerCase()
      const code = event.code
      if (
        key === 'w' ||
        key === 'a' ||
        key === 's' ||
        key === 'd' ||
        key === 'arrowup' ||
        key === 'arrowleft' ||
        key === 'arrowdown' ||
        key === 'arrowright'
      ) {
        event.preventDefault()
        keys.current[key] = false
      }
      if (key === 'shift') {
        keys.current.shift = false
      }
      if (key === ' ' || code === 'Space') {
        event.preventDefault()
        keys.current.space = false
      }
      updateMovement()
    }

    const onWindowBlur = () => {
      firingWithMouse.current = false
      keys.current.w = false
      keys.current.a = false
      keys.current.s = false
      keys.current.d = false
      keys.current.arrowup = false
      keys.current.arrowleft = false
      keys.current.arrowdown = false
      keys.current.arrowright = false
      keys.current.shift = false
      keys.current.space = false
      setInput(defaultInput)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [updateMovement])

  const setAimFromClientPosition = (clientX: number, clientY: number) => {
    const normalizedX = clientX / window.innerWidth
    const normalizedY = clientY / window.innerHeight

    setInput((state) => ({
      ...state,
      aim: {
        x: clamp((0.5 - normalizedX) * 2.6, -1.35, 1.35),
        y: clamp(1.1 - normalizedY * 1.6, -0.35, 1.35),
      },
    }))
  }

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      setAimFromClientPosition(event.clientX, event.clientY)
    }

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      firingWithMouse.current = true
      setAimFromClientPosition(event.clientX, event.clientY)
      setInput((state) => ({ ...state, firing: true }))
    }

    const onMouseUp = () => {
      firingWithMouse.current = false
      setInput((state) => ({ ...state, firing: keys.current.space }))
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const surfaceHandlers = {
    onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      setAimFromClientPosition(event.clientX, event.clientY)
    },
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      if (event.pointerType !== 'touch' && event.button !== 0) return
      if (event.pointerType !== 'touch') {
        firingWithMouse.current = true
      }
      setAimFromClientPosition(event.clientX, event.clientY)
      setInput((state) => ({ ...state, firing: true }))
    },
    onPointerUp() {
      firingWithMouse.current = false
      setInput((state) => ({ ...state, firing: keys.current.space }))
    },
    onPointerLeave() {
      if (!firingWithMouse.current) {
        setInput((state) => ({ ...state, firing: keys.current.space }))
      }
    },
  }

  return {
    input,
    surfaceHandlers,
    setVirtualMove(moveX: number, moveY: number) {
      setInput((state) => ({ ...state, moveX, moveY }))
    },
    setVirtualBoost(boosting: boolean) {
      setInput((state) => ({ ...state, boosting }))
    },
    setVirtualFiring(firing: boolean) {
      setInput((state) => ({ ...state, firing }))
    },
    nudgeAim(dx: number, dy: number) {
      setInput((state) => ({
        ...state,
        aim: {
          x: clamp(state.aim.x - dx, -1.5, 1.5),
          y: clamp(state.aim.y + dy, -1.5, 1.6),
        },
      }))
    },
    reset() {
      setInput(defaultInput)
    },
  }
}
