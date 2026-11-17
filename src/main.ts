import './style.css'
import Balls from './game/Balls.ts'
import Paddle from './game/Paddle.ts'
import Strip from './game/Strip.ts'

const canvas = document.getElementById('main') as HTMLCanvasElement
const fps = document.getElementById('fps-counter') as HTMLDivElement
const inputWidth = document.getElementById('input-width') as HTMLInputElement
const inputHeight = document.getElementById('input-height') as HTMLInputElement
const btnResize = document.getElementById('btn-resize') as HTMLButtonElement
const btnFill = document.getElementById('btn-fill') as HTMLButtonElement
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement

const gl: WebGL2RenderingContext = (canvas.getContext('2d-webgl') ||
  canvas.getContext('webgl2', {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    powerPreference: 'high-performance',
  })) as WebGL2RenderingContext

if (!gl) {
  alert(
    "your browser doesn't support the WebGL2 needed, the page will now crash 👍",
  )
}

gl.disable(gl.DEPTH_TEST)
gl.depthMask(false)
gl.enable(gl.BLEND)
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

const paddleShader = Paddle.linkShader(gl)
const stripShader = Strip.linkShader(gl)
const ballsUpdateShader = Balls.linkUpdateShader(gl)
const ballsDamageShader = Balls.linkDamageShader(gl)
const ballsRenderShader = Balls.linkRenderShader(gl)

const paddle = new Paddle(gl, 0.45, 0.05)
const mml = paddle.mouseMoveListener(canvas)
canvas.addEventListener('mousemove', mml)

interface GameState {
  width: number
  height: number
  strip: Strip
  balls: Balls
}

let state: GameState | undefined

function resetGame(width: number, height: number) {
  const clampedW = Math.max(64, Math.min(3840, Math.floor(width)))
  const clampedH = Math.max(64, Math.min(2160, Math.floor(height)))

  if (state) {
    state.balls.destroy(gl)
    state.strip.destroy(gl)
  }

  canvas.width = clampedW
  canvas.height = clampedH
  inputWidth.value = String(clampedW)
  inputHeight.value = String(clampedH)

  const stripHeight = Math.max(1, Math.floor(clampedH / 4))
  const strip = new Strip(gl, clampedW, stripHeight)
  const balls = new Balls(gl, paddle, strip)

  state = { width: clampedW, height: clampedH, strip, balls }
}

resetGame(canvas.width, canvas.height)

btnResize.addEventListener('click', () => {
  resetGame(Number(inputWidth.value), Number(inputHeight.value))
})
btnFill.addEventListener('click', () => {
  resetGame(window.innerWidth, window.innerHeight)
})
btnReset.addEventListener('click', () => {
  if (state) resetGame(state.width, state.height)
})

const colorCorrection: boolean = true
const frameFunc = (dt: number, t: number) => {
  if (!state) return

  state.balls.update(
    gl,
    ballsUpdateShader,
    ballsDamageShader,
    dt,
    state.width,
    state.height,
  )

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, state.width, state.height)
  gl.clearColor(0.0, 0.0, 0.0, 1.0)
  gl.clear(gl.COLOR_BUFFER_BIT)

  state.strip.draw(gl, stripShader, state.width, state.height, colorCorrection)
  paddle.draw(gl, paddleShader, t, state.width, state.height, colorCorrection)
  state.balls.draw(gl, ballsRenderShader, colorCorrection)
}

let lastFps: DOMHighResTimeStamp | undefined
let lastTime: DOMHighResTimeStamp | undefined
const frameCb = (t: DOMHighResTimeStamp) => {
  const dt = lastTime !== undefined ? t - lastTime : 0
  lastTime = t

  const tS = t / 1000
  const dtS = dt / 1000

  if (dtS !== 0 && (lastFps === undefined || t - lastFps > 500)) {
    fps.textContent = `${Math.round(1 / dtS)}`
    lastFps = t
  }

  frameFunc(Math.min(dtS, 0.1), tS)
  requestAnimationFrame(frameCb)
}
requestAnimationFrame(frameCb)
