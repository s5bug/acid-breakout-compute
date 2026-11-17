#version 300 es
precision highp float;

// see ball_update for layout of meta field
layout(location = 1) in vec4 a_meta;

void main() {
    vec2 hitUV = a_meta.yz;

    // map [0, 1] UV to [-1, 1] clip space
    gl_Position = vec4(hitUV * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = 1.0;
}
