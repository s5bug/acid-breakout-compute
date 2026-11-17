#version 300 es
precision highp float;

uniform vec4 u_stripRect; // min.x, min.y, max.x, max.y
out vec2 v_uv;

void main() {
    // see paddle.vert for explanation of this code
    vec2 corner = vec2(gl_VertexID & 1, (gl_VertexID >> 1) & 1);
    v_uv = corner;
    vec2 clipPos = mix(u_stripRect.xy, u_stripRect.zw, corner);
    gl_Position = vec4(clipPos, 0.0, 1.0);
}
