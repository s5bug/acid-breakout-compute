#version 300 es
precision highp float;

uniform vec4 u_paddleRect; // min.x, min.y, max.x, max.y

void main() {
    // we use the same vertex shader for all four corners
    // so this means corner is (0, 0) for the first vertex, (1, 0) for the second, (0, 1) for the third, (1, 1)
    vec2 corner = vec2(gl_VertexID & 1, (gl_VertexID >> 1) & 1);
    vec2 clipPos = mix(u_paddleRect.xy, u_paddleRect.zw, corner);
    gl_Position = vec4(clipPos, 0.0, 1.0);
}
