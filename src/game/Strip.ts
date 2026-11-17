import stripFS from '../shaders/strip.frag'
import stripVS from '../shaders/strip.vert'
import { compileShader, uniformOrCrash } from '../util.ts'

interface StripUniforms {
  stripRect: WebGLUniformLocation
  stripTex: WebGLUniformLocation
  viewportSize: WebGLUniformLocation
  aspect: WebGLUniformLocation
  colorCorrection: WebGLUniformLocation
}

export default class Strip {
  private readonly _vao: WebGLVertexArrayObject
  private readonly _texture: WebGLTexture
  private readonly _fbo: WebGLFramebuffer

  readonly widthPx: number
  readonly heightPx: number

  static linkShader(gl: WebGL2RenderingContext): {
    prog: WebGLProgram
    uniforms: StripUniforms
  } {
    const prog = compileShader(gl, stripVS, stripFS)
    const uniforms: StripUniforms = {
      stripRect: uniformOrCrash(gl, prog, 'u_stripRect'),
      stripTex: uniformOrCrash(gl, prog, 'u_stripTex'),
      viewportSize: uniformOrCrash(gl, prog, 'u_viewportSize'),
      aspect: uniformOrCrash(gl, prog, 'u_aspect'),
      colorCorrection: uniformOrCrash(gl, prog, 'u_colorCorrection'),
    }
    return { prog, uniforms }
  }

  constructor(gl: WebGL2RenderingContext, widthPx: number, heightPx: number) {
    this._vao = gl.createVertexArray()

    this._texture = gl.createTexture()
    // initialize texture to a full strip
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    const texData = new Uint8Array(widthPx * heightPx)
    texData.fill(255)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      widthPx,
      heightPx,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      texData,
    )

    // do not anti-alias, we need "brick"-like detection
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // attach the texture to a framebuffer so the balls can write to it
    this._fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo)
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this._texture,
      0,
    )
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    this.widthPx = widthPx
    this.heightPx = heightPx
  }

  get clipRect() {
    return [-1.0, 0.5, 1.0, 1.0]
  }

  get texture() {
    return this._texture
  }

  get fbo() {
    return this._fbo
  }

  draw(
    gl: WebGL2RenderingContext,
    shader: { prog: WebGLProgram; uniforms: StripUniforms },
    viewportWidth: number,
    viewportHeight: number,
    colorCorrection: boolean = true,
  ) {
    gl.bindVertexArray(this._vao)
    gl.useProgram(shader.prog)

    const [minX, minY, maxX, maxY] = this.clipRect
    gl.uniform4f(shader.uniforms.stripRect, minX, minY, maxX, maxY)
    gl.uniform2f(shader.uniforms.viewportSize, viewportWidth, viewportHeight)
    gl.uniform2f(shader.uniforms.aspect, 1.0, 1.0)
    gl.uniform1ui(shader.uniforms.colorCorrection, colorCorrection ? 1 : 0)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.uniform1i(shader.uniforms.stripTex, 0)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  destroy(gl: WebGL2RenderingContext) {
    gl.deleteFramebuffer(this._fbo)
    gl.deleteTexture(this._texture)
    gl.deleteVertexArray(this._vao)
  }
}
