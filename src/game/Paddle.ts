import paddleFS from '../shaders/paddle.frag'
import paddleVS from '../shaders/paddle.vert'
import { compileShader, uniformOrCrash } from '../util.ts'

interface PaddleUniforms {
  paddleRect: WebGLUniformLocation
  viewportSize: WebGLUniformLocation
  aspect: WebGLUniformLocation
  time: WebGLUniformLocation
  colorCorrection: WebGLUniformLocation
}

export default class Paddle {
  private readonly _emptyVao: WebGLVertexArrayObject
  private _centerX: number

  readonly width: number
  readonly height: number

  static linkShader(gl: WebGL2RenderingContext): {
    prog: WebGLProgram
    uniforms: PaddleUniforms
  } {
    const prog = compileShader(gl, paddleVS, paddleFS)
    const uniforms: PaddleUniforms = {
      paddleRect: uniformOrCrash(gl, prog, 'u_paddleRect'),
      viewportSize: uniformOrCrash(gl, prog, 'u_viewportSize'),
      aspect: uniformOrCrash(gl, prog, 'u_aspect'),
      time: uniformOrCrash(gl, prog, 'u_time'),
      colorCorrection: uniformOrCrash(gl, prog, 'u_colorCorrection'),
    }
    return { prog, uniforms }
  }

  constructor(gl: WebGL2RenderingContext, width: number, height: number) {
    this._emptyVao = gl.createVertexArray()

    this._centerX = 0.0
    this.width = width
    this.height = height
  }

  get centerX() {
    return this._centerX
  }

  mouseMoveListener(canvas: HTMLCanvasElement): (ev: MouseEvent) => void {
    return (ev) => {
      const rect = canvas.getBoundingClientRect()

      const x = ev.clientX - rect.left

      const glX = (x / rect.width) * 2 - 1

      this.moveTo(glX)
    }
  }

  moveTo(centerX: number) {
    // clamp so the paddle is bounded by the screen
    this._centerX = Math.max(
      -1.0 + this.width / 2,
      Math.min(1.0 - this.width / 2, centerX),
    )
  }

  get clipRect(): [number, number, number, number] {
    const centerY = -0.8
    return [
      this._centerX - this.width / 2,
      centerY - this.height / 2,
      this._centerX + this.width / 2,
      centerY + this.height / 2,
    ]
  }

  draw(
    gl: WebGL2RenderingContext,
    shader: { prog: WebGLProgram; uniforms: PaddleUniforms },
    t: number,
    viewportWidth: number,
    viewportHeight: number,
    colorCorrection: boolean = true,
  ) {
    gl.bindVertexArray(this._emptyVao)
    gl.useProgram(shader.prog)

    const [minX, minY, maxX, maxY] = this.clipRect
    gl.uniform4f(shader.uniforms.paddleRect, minX, minY, maxX, maxY)
    gl.uniform2f(shader.uniforms.viewportSize, viewportWidth, viewportHeight)
    gl.uniform2f(shader.uniforms.aspect, 1.0, 1.0)
    gl.uniform1f(shader.uniforms.time, t)
    gl.uniform1ui(shader.uniforms.colorCorrection, colorCorrection ? 1 : 0)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}
