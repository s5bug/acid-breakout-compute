#version 300 es
precision highp float;

layout(location = 0) in vec4 a_posVel;
// see ball_update for details on `meta` and `trailMeta`
layout(location = 1) in vec4 a_meta;
layout(location = 2) in vec4 a_trailMeta;
layout(location = 3) in vec4 a_hist01;
layout(location = 4) in vec4 a_hist23;
layout(location = 5) in vec4 a_hist45;
layout(location = 6) in vec4 a_hist67;

uniform uint u_colorCorrection;
// state:
// 0 = ball itself
// 1 = dots (juvenile state)
// 2 = lines (adult state)
uniform int u_renderMode;

out vec4 v_color;

#include "./color.glsl"

vec2 getHistoryPos(int idx) {
    if (idx == 0) return a_hist01.xy;
    if (idx == 1) return a_hist01.zw;
    if (idx == 2) return a_hist23.xy;
    if (idx == 3) return a_hist23.zw;
    if (idx == 4) return a_hist45.xy;
    if (idx == 5) return a_hist45.zw;
    if (idx == 6) return a_hist67.xy;
    return a_hist67.zw;
}

float getHistoryAlpha(int idx, float historyLen) {
    float t = float(idx) / max(1.0, historyLen - 1.0);
    return 1.0 - t;
}

void main() {
    float state = a_meta.x;
    if (state <= 0.0 || state >= 3.0) {
        // if this ball is not live, move the vertex out of the clip space to cull it
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }

    float historyLen = a_trailMeta.y;
    int iHistoryLen = int(historyLen);

    // we may be rendering a different vertex than the head of the ball
    // for example, a point from the history
    vec2 realPos;
    float alpha = 1.0;

    if (u_renderMode == 0) {
        realPos = a_posVel.xy;
        gl_PointSize = 1.0;
    } else if (u_renderMode == 1) {
        // the dotted trail should be (at most) 8 points
        // if we're not juvenile, or we're not in the "real" history buffer, cull
        if (state != 1.0 || gl_VertexID >= iHistoryLen) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
        }
        // otherwise, we take the position and alpha from the history
        realPos = getHistoryPos(gl_VertexID);
        alpha = getHistoryAlpha(gl_VertexID, historyLen);
        gl_PointSize = 1.0;
    } else {
        // the solid trail is (at most) 8 lines, which means 16 points
        // points [0, 1] identify segment 0, [2, 3] identify segment 1, etc.
        int segIdx = gl_VertexID >> 1;
        // then [0, 2, 4, ...] identify the line start vertex, [1, 3, 5, ...] identify the end vertex
        int endPt  = gl_VertexID & 1;
        // if we're not adult, or we're not in the "real" history buffer, cull
        if (state != 2.0 || segIdx >= iHistoryLen) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
        }
        // "which point should be retrieved" ends up being something like [head, h[0]], [h[0], h[1]], ...
        // so we "fake" h[-1] as head
        int nodeIdx = segIdx + endPt - 1;
        if (nodeIdx < 0) {
            realPos = a_posVel.xy;
            alpha = 1.0;
        } else {
            realPos = getHistoryPos(nodeIdx);
            alpha = getHistoryAlpha(nodeIdx, historyLen);
        }
    }

    float spawnX = a_meta.w;
    vec3 rgb;

    if (spawnX <= -2.0) {
        rgb = vec3(1.0, 1.0, 1.0);
    } else {
        vec3 lrgb = lrgbFromHsv(vec3(spawnX * radians(360.0), 1.0, 1.0));
        rgb = (u_colorCorrection != 0u) ? srgbFromLrgb(lrgb) : lrgb;
    }

     v_color = vec4(rgb, alpha);
    gl_Position = vec4(realPos, 0.0, 1.0);
}
