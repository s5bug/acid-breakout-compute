#version 300 es
precision highp float;

uniform vec2 u_viewportSize;
uniform vec2 u_aspect;
uniform float u_time;
uniform uint u_colorCorrection;

out vec4 fragColor;

#include "./color.glsl"

void main() {
    vec2 pos = (gl_FragCoord.xy / u_viewportSize - 0.5) / u_aspect + 0.5;
    vec3 lrgb = lrgbFromHsv(vec3(pos.x * radians(360.0) + u_time, 1.0, 1.0));
    vec4 color = vec4(lrgb, 1.0);

    if (u_colorCorrection != 0u) {
        color.rgb = srgbFromLrgb(color.rgb);
    }

    fragColor = color;
}
