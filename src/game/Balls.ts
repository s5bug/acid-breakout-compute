import ballDamageFS from '../shaders/ball_damage.frag'
import ballDamageVS from '../shaders/ball_damage.vert'
import ballRenderFS from '../shaders/ball_render.frag'
import ballRenderVS from '../shaders/ball_render.vert'
import ballUpdateFS from '../shaders/ball_update.frag'
import ballUpdateVS from '../shaders/ball_update.vert'
import { compileShader, uniformOrCrash } from '../util.ts'
import type Paddle from './Paddle.ts'
import type Strip from './Strip.ts'

interface BallsUpdateUniforms {
  dt: WebGLUniformLocation
  viewportSize: WebGLUniformLocation
  paddleRect: WebGLUniformLocation
  paddleCenterX: WebGLUniformLocation
  stripRect: WebGLUniformLocation
  stripTex: WebGLUniformLocation
}

type BallsDamageUniforms = Record<keyof unknown, never>

interface BallsRenderUniforms {
  colorCorrection: WebGLUniformLocation
  renderMode: WebGLUniformLocation
}

export default class Balls {
  readonly maxBalls: number
  readonly paddle: Paddle
  readonly strip: Strip

  private _readIdx: number
  private readonly _stateBuffers: WebGLBuffer[]
  private readonly _updateVaos: WebGLVertexArrayObject[]
  private readonly _renderVaos: WebGLVertexArrayObject[]

  static linkUpdateShader(gl: WebGL2RenderingContext): {
    prog: WebGLProgram
    uniforms: BallsUpdateUniforms
  } {
    const prog = compileShader(gl, ballUpdateVS, ballUpdateFS, [
      'v_posVel',
      'v_meta',
      'v_trailMeta',
      'v_hist01',
      'v_hist23',
      'v_hist45',
      'v_hist67',
    ])
    const uniforms: BallsUpdateUniforms = {
      dt: uniformOrCrash(gl, prog, 'u_dt'),
      viewportSize: uniformOrCrash(gl, prog, 'u_viewportSize'),
      paddleRect: uniformOrCrash(gl, prog, 'u_paddleRect'),
      paddleCenterX: uniformOrCrash(gl, prog, 'u_paddleCenterX'),
      stripRect: uniformOrCrash(gl, prog, 'u_stripRect'),
      stripTex: uniformOrCrash(gl, prog, 'u_stripTex'),
    }
    return { prog, uniforms }
  }

  static linkDamageShader(gl: WebGL2RenderingContext): {
    prog: WebGLProgram
    uniforms: BallsDamageUniforms
  } {
    const prog = compileShader(gl, ballDamageVS, ballDamageFS)
    const uniforms: BallsDamageUniforms = {}
    return { prog, uniforms }
  }

  static linkRenderShader(gl: WebGL2RenderingContext): {
    prog: WebGLProgram
    uniforms: BallsRenderUniforms
  } {
    const prog = compileShader(gl, ballRenderVS, ballRenderFS)
    const uniforms: BallsRenderUniforms = {
      colorCorrection: uniformOrCrash(gl, prog, 'u_colorCorrection'),
      renderMode: uniformOrCrash(gl, prog, 'u_renderMode'),
    }
    return { prog, uniforms }
  }

  constructor(gl: WebGL2RenderingContext, paddle: Paddle, strip: Strip) {
    this.maxBalls = 1 + strip.widthPx * strip.heightPx
    this.paddle = paddle
    this.strip = strip

    // right now (posVel [4], state [1], hitUv [2], spawnX [1], historyMeta [4], history [16])
    // [0: posVel, 1: meta, 2: historyMeta, 3&4&5&6: history]
    const FLOATS_PER_BALL = 28
    // 4 bytes in a float
    const STRIDE_BYTES = FLOATS_PER_BALL * 4
    const initialData = new Float32Array(this.maxBalls * FLOATS_PER_BALL)

    initialData[0] = 0.0 // pos.x, centered
    initialData[1] = 0.0 // pos.y, centered
    initialData[2] = 0.0 // vel.x, not moving
    initialData[3] = 0.0 // vel.y, not moving
    initialData[4] = 1.0 // unhit/falling
    initialData[5] = -2.0 // no hit
    initialData[6] = -2.0 // no hit
    initialData[7] = -2.0 // spawnX = -2.0 means render as white

    const [stripMinX, stripMinY, stripMaxX, stripMaxY] = strip.clipRect
    const stripClipW = stripMaxX - stripMinX
    const stripClipH = stripMaxY - stripMinY
    for (let y = 0; y < strip.heightPx; y++) {
      for (let x = 0; x < strip.widthPx; x++) {
        const ballIdx = 1 + (y * strip.widthPx + x)
        const offset = ballIdx * FLOATS_PER_BALL

        const u = (x + 0.5) / strip.widthPx
        const v = (y + 0.5) / strip.heightPx

        const posX = stripMinX + u * stripClipW
        const posY = stripMinY + v * stripClipH

        // velocity starts random [-16, 16] px/s
        const velX = (Math.random() - 0.5) * 32.0 * (2.0 / strip.widthPx)

        initialData[offset] = posX
        initialData[1 + offset] = posY
        initialData[2 + offset] = velX
        initialData[3 + offset] = 0.0
        initialData[4 + offset] = 0.0 // dormant
        initialData[5 + offset] = -2.0 // no hit
        initialData[6 + offset] = -2.0 // no hit
        initialData[7 + offset] = u // spawnX for this ball
      }
    }

    this._readIdx = 0
    this._stateBuffers = [gl.createBuffer(), gl.createBuffer()]
    for (const stateBuf of this._stateBuffers) {
      gl.bindBuffer(gl.ARRAY_BUFFER, stateBuf)
      gl.bufferData(gl.ARRAY_BUFFER, initialData, gl.DYNAMIC_COPY)
    }

    this._updateVaos = [gl.createVertexArray(), gl.createVertexArray()]
    this._renderVaos = [gl.createVertexArray(), gl.createVertexArray()]
    for (let i = 0; i < 2; i++) {
      // when we are rendering from a _readIdx of 0, we use the data written into 0
      gl.bindVertexArray(this._updateVaos[i])
      gl.bindBuffer(gl.ARRAY_BUFFER, this._stateBuffers[i])
      for (let attr = 0; attr < 7; attr++) {
        gl.enableVertexAttribArray(attr)
        gl.vertexAttribPointer(
          attr,
          4,
          gl.FLOAT,
          false,
          STRIDE_BYTES,
          attr * 16,
        )
      }

      // the render Vao ends up getting sent a bunch of trail vertices
      // our attributes are per-ball, not per-vertex
      gl.bindVertexArray(this._renderVaos[i])
      gl.bindBuffer(gl.ARRAY_BUFFER, this._stateBuffers[i])
      for (let attr = 0; attr < 7; attr++) {
        gl.enableVertexAttribArray(attr)
        gl.vertexAttribPointer(
          attr,
          4,
          gl.FLOAT,
          false,
          STRIDE_BYTES,
          attr * 16,
        )
        gl.vertexAttribDivisor(attr, 1)
      }
    }

    gl.bindVertexArray(null)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
  }

  update(
    gl: WebGL2RenderingContext,
    shader: { prog: WebGLProgram; uniforms: BallsUpdateUniforms },
    damageShader: { prog: WebGLProgram; uniforms: BallsDamageUniforms },
    dt: number,
    viewportWidth: number,
    viewportHeight: number,
  ) {
    // we need to read the strip texture _and_ write the strip fbo
    // GL doesn't let us do this in one step, so we have one update shader & one tiny damage shader
    const writeIndex = 1 - this._readIdx

    // first: transform feedback
    // we read from the reading VAO and write to the writing Feedback Buffer
    gl.bindVertexArray(this._updateVaos[this._readIdx])
    gl.bindBufferBase(
      gl.TRANSFORM_FEEDBACK_BUFFER,
      0,
      this._stateBuffers[writeIndex],
    )

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.strip.texture)
    gl.enable(gl.RASTERIZER_DISCARD)

    gl.useProgram(shader.prog)
    gl.uniform1f(shader.uniforms.dt, dt)
    gl.uniform2f(shader.uniforms.viewportSize, viewportWidth, viewportHeight)
    const [paddleMinX, paddleMinY, paddleMaxX, paddleMaxY] =
      this.paddle.clipRect
    gl.uniform4f(
      shader.uniforms.paddleRect,
      paddleMinX,
      paddleMinY,
      paddleMaxX,
      paddleMaxY,
    )
    gl.uniform1f(shader.uniforms.paddleCenterX, this.paddle.centerX)
    const [stripMinX, stripMinY, stripMaxX, stripMaxY] = this.strip.clipRect
    gl.uniform4f(
      shader.uniforms.stripRect,
      stripMinX,
      stripMinY,
      stripMaxX,
      stripMaxY,
    )
    gl.uniform1i(shader.uniforms.stripTex, 0)

    gl.beginTransformFeedback(gl.POINTS)
    gl.drawArrays(gl.POINTS, 0, this.maxBalls)
    gl.endTransformFeedback()

    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null)

    // second: damage strip
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.disable(gl.RASTERIZER_DISCARD)

    // redirect rendering to the strip texture
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.strip.fbo)
    gl.viewport(0, 0, this.strip.widthPx, this.strip.heightPx)
    // write directly to pixels with no anti-aliasing or blending
    gl.disable(gl.BLEND)

    // we just wrote into writeIndex so that's where we're updating the texture from
    gl.bindVertexArray(this._updateVaos[writeIndex])
    gl.useProgram(damageShader.prog)
    gl.drawArrays(gl.POINTS, 0, this.maxBalls)

    gl.enable(gl.BLEND)

    this._readIdx = writeIndex
  }

  draw(
    gl: WebGL2RenderingContext,
    shader: { prog: WebGLProgram; uniforms: BallsRenderUniforms },
    colorCorrection: boolean,
  ) {
    gl.bindVertexArray(this._renderVaos[this._readIdx])
    gl.useProgram(shader.prog)
    gl.uniform1ui(shader.uniforms.colorCorrection, colorCorrection ? 1 : 0)

    // juvenile balls have dotted trails, so draw 8 points
    gl.uniform1i(shader.uniforms.renderMode, 1)
    gl.drawArraysInstanced(gl.POINTS, 0, 8, this.maxBalls)

    // adult balls have line trails, so draw 8 lines (16 points)
    gl.uniform1i(shader.uniforms.renderMode, 2)
    gl.drawArraysInstanced(gl.LINES, 0, 16, this.maxBalls)

    // then 1 point for the actual balls
    gl.uniform1i(shader.uniforms.renderMode, 0)
    gl.drawArraysInstanced(gl.POINTS, 0, 1, this.maxBalls)
  }

  destroy(gl: WebGL2RenderingContext) {
    for (const buf of this._stateBuffers) gl.deleteBuffer(buf)
    for (const vao of this._updateVaos) gl.deleteVertexArray(vao)
    for (const vao of this._renderVaos) gl.deleteVertexArray(vao)
  }
}
