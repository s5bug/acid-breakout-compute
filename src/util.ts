export function compileShader(
  gl: WebGL2RenderingContext,
  vert: string,
  frag: string,
  transformFeedbackVaryings: Iterable<string> | null = null,
): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)
  if (!vs) throw new Error(`error creating vertex shader: ${gl.getError()}`)
  gl.shaderSource(vs, vert)
  gl.compileShader(vs)
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(vs) || undefined)

  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  if (!fs) throw new Error(`error creating fragment shader: ${gl.getError()}`)
  gl.shaderSource(fs, frag)
  gl.compileShader(fs)
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(fs) || undefined)

  const prog = gl.createProgram()
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  if (transformFeedbackVaryings) {
    gl.transformFeedbackVaryings(
      prog,
      transformFeedbackVaryings,
      gl.INTERLEAVED_ATTRIBS,
    )
  }
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(prog) || undefined)
  return prog
}

export function uniformOrCrash(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const result = gl.getUniformLocation(prog, name)
  if (result === null) throw new Error(`could not find uniform: ${name}`)
  return result
}
