#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_stripTex;
uniform vec2 u_viewportSize;
uniform vec2 u_aspect;
uniform uint u_colorCorrection;

out vec4 fragColor;

#include "./color.glsl"

void main() {
    // we are given (u, v) in [0, 1]² range and want to convert it to [0, w)×[0, h) range
    ivec2 texSize = textureSize(u_stripTex, 0);
    ivec2 coord = clamp(ivec2(v_uv * vec2(texSize)), ivec2(0), texSize - ivec2(1));

    // our texture has one channel (r): if the pixel has been destroyed (turned into a ball), then it's not part of the strip
    if (texelFetch(u_stripTex, coord, 0).r == 0.0) {
        discard;
    }

    vec2 pos = (gl_FragCoord.xy / u_viewportSize - 0.5) / u_aspect + 0.5;
    vec3 lrgb = lrgbFromHsv(vec3(pos.x * radians(360.0), 1.0, 1.0));
    vec4 color = vec4(lrgb, 1.0);

    if (u_colorCorrection != 0u) {
        color.rgb = srgbFromLrgb(color.rgb);
    }

    fragColor = color;
}
