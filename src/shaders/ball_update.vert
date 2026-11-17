#version 300 es
precision highp float;

layout(location = 0) in vec4 a_posVel;
// (state enum, hitUV.x, hitUV.y, spawnX)
// hitUV gets unconditionally overridden, this is just nice to use the same buffers for everything
// state:
// - 0: dormant (waiting for the pixel of the strip to disappear)
// - 1: juvenile (unhit/falling with gravity, dotted line)
// - 2: adult (hit/moving in straight line, filled line)
// - 3: fossil (dead/inactive, should be culled)
layout(location = 1) in vec4 a_meta;
// (historyTimer, historyLen, unused, unused)
layout(location = 2) in vec4 a_trailMeta;
layout(location = 3) in vec4 a_hist01;
layout(location = 4) in vec4 a_hist23;
layout(location = 5) in vec4 a_hist45;
layout(location = 6) in vec4 a_hist67;

uniform float u_dt;
uniform vec2 u_viewportSize;
uniform vec4 u_paddleRect;
uniform float u_paddleCenterX;
uniform vec4 u_stripRect;
uniform sampler2D u_stripTex;

out vec4 v_posVel;
// (state enum, hitUV.x, hitUV.y, spawnX)
out vec4 v_meta;
out vec4 v_trailMeta;
out vec4 v_hist01;
out vec4 v_hist23;
out vec4 v_hist45;
out vec4 v_hist67;

// a trail lasts 0.25s and has 8 segments
const float HISTORY_INTERVAL = 0.25 / 8.0;

void pushHistory(inout vec2 h[8], inout float len, vec2 newPos) {
    // newest history ends up in hist01.xy
    for (int i = 7; i > 0; --i) {
        h[i] = h[i - 1];
    }
    h[0] = newPos;
    len = min(8.0, len + 1.0);
}

float gravityInClipSpace() {
    // 60 px/s^2
    // [-1, 1] (clip space) = [0, h) (screen space)
    // so 2/h gives us the scaling factor to get from screen to clip space
    return 60.0 * (2.0 / u_viewportSize.y);
}

bool rectOverlaps(vec2 minA, vec2 maxA, vec2 minB, vec2 maxB) {
    return (minA.x < maxB.x && maxA.x > minB.x && minA.y < maxB.y && maxA.y > minB.y);
}

void main() {
    vec2 pos = a_posVel.xy;
    vec2 vel = a_posVel.zw;
    float state = a_meta.x;
    float spawnX = a_meta.w;

    float historyTimer = a_trailMeta.x;
    float historyLen = a_trailMeta.y;
    vec2 h[8] = vec2[8](
        a_hist01.xy, a_hist01.zw,
        a_hist23.xy, a_hist23.zw,
        a_hist45.xy, a_hist45.zw,
        a_hist67.xy, a_hist67.zw
    );

    // -2 is well outside texture bounds = no hit this frame
    vec2 hitUV = vec2(-2.0);

    // fossil balls run no math and never hit anything
    if (state >= 3.0) {
        v_posVel = a_posVel;
        v_meta = vec4(state, hitUV, 0.0);
        v_trailMeta = vec4(historyTimer, historyLen, 0.0, 0.0);
        v_hist01 = vec4(h[0], h[1]);
        v_hist23 = vec4(h[2], h[3]);
        v_hist45 = vec4(h[4], h[5]);
        v_hist67 = vec4(h[6], h[7]);
        return;
    }

    // check state 0 balls to see if their texture has disappeared
    if (state <= 0.0) {
        vec2 uv = (pos - u_stripRect.xy) / (u_stripRect.zw - u_stripRect.xy);
        ivec2 texSize = textureSize(u_stripTex, 0);
        ivec2 coord = clamp(ivec2(uv * vec2(texSize)), ivec2(0), texSize - ivec2(1));

        if (texelFetch(u_stripTex, coord, 0).r > 0.0) {
            // if there's still a brick, do nothing and early exit
            v_posVel = a_posVel;
            v_meta = vec4(state, hitUV, spawnX);
            v_trailMeta = vec4(historyTimer, historyLen, 0.0, 0.0);
            v_hist01 = vec4(h[0], h[1]);
            v_hist23 = vec4(h[2], h[3]);
            v_hist45 = vec4(h[4], h[5]);
            v_hist67 = vec4(h[6], h[7]);
            return;
        }

        // otherwise, transition to juvenile
        state = 1.0;
    }

    // in state 1 we're just falling, in state 2 we're moving normally
    bool isHit = (state >= 2.0);
    if (!isHit) {
        vel.y -= gravityInClipSpace() * u_dt;
    }
    pos += vel * u_dt;

    // 2/h gave us the [0, h) → [-1, 1] scaling factor
    // so 1/h gives us [0, h) → [-0.5, 0.5]
    // this is a "quarter of a pixel" as a rectangle
    // half a pixel in each direction
    vec2 halfPxRect = 1.0 / u_viewportSize;
    vec2 targetPos = pos + vel * u_dt;
    vec2 targetMin = targetPos - halfPxRect;
    vec2 targetMax = targetPos + halfPxRect;

    // if we collide with something, we add the collision point to the history
    bool hasCollision = false;

    if (rectOverlaps(targetMin, targetMax, u_paddleRect.xy, u_paddleRect.zw)) {
        // we have a velocity in [-1, 1]² and aspectScale lets us convert that to pixel scale
        vec2 aspectScale = u_viewportSize * 0.5;
        // so this is the current velocity in pixels
        vec2 velPx = vel * aspectScale;

        // if we collide with the paddle, we transition to the hit state & bounce based on distance from the paddle center
        float speedPx = length(velPx);
        if (!isHit) {
            isHit = true;
            speedPx *= sqrt(2.0);
        }

        // invert the Y direction, but change the X direction based on the displacement from the paddle center
        vec2 bounceDirPx = vec2((pos.x - u_paddleCenterX) * aspectScale.x, -velPx.y);
        vel = (normalize(bounceDirPx) * speedPx) / aspectScale;
        hasCollision = true;
    }
    else if (isHit &&
             targetPos.x >= u_stripRect.x && targetPos.x < u_stripRect.z &&
             targetPos.y >= u_stripRect.y && targetPos.y < u_stripRect.w) {
        // otherwise, if we hit the strip of bricks, we need to calculate the UV/texture coordinate within the bricks
        vec2 uv = (targetPos - u_stripRect.xy) / (u_stripRect.zw - u_stripRect.xy);
        ivec2 texSize = textureSize(u_stripTex, 0);
        ivec2 coord = clamp(ivec2(uv * vec2(texSize)), ivec2(0), texSize - ivec2(1));

        // if that coordinate is occupied, we flip vertically, and mark hitUV
        if (texelFetch(u_stripTex, coord, 0).r > 0.0) {
            vel.y *= -1.0;
            hitUV = (vec2(coord) + 0.5) / vec2(texSize);
            hasCollision = true;
        }
    }
    else if (isHit && (targetMax.y > 1.0 || targetMin.x < -1.0 || targetMax.x > 1.0)) {
        // if we hit the edge of the screen at the top, flip vertically
        // if we hit the edge of the screen at either side, flip horizontally
        // this doesn't apply to juvenile balls, who should just fall off-screen
        if (targetMax.y > 1.0) {
            vel.y *= -1.0;
        }
        if (targetMin.x < -1.0 || targetMax.x > 1.0) {
            vel.x *= -1.0;
        }
        hasCollision = true;
    }

    if (hasCollision) {
        vec2 clampedTarget = clamp(targetPos, vec2(-1.0) + halfPxRect, vec2(1.0) - halfPxRect);
        pushHistory(h, historyLen, clampedTarget);
    }

    if (historyTimer > 0.0) {
        historyTimer = max(0.0, historyTimer - u_dt);
    } else {
        pushHistory(h, historyLen, pos);
        historyTimer = HISTORY_INTERVAL;
    }

    // if the ball is completely off-screen, then we transition to state 3 (fossil)
    // otherwise, if the ball is hit, we transition to state 2 (adult)
    // and if that's not the case either, state 1 is our default (otherwise we would've early-returned)
    bool visible = rectOverlaps(pos - halfPxRect, pos + halfPxRect, vec2(-1.0), vec2(1.0));
    // we need to do this check for the ball's history points too
    // the ball should remain drawn if any history point is on-screen
    int iHistoryLen = int(historyLen);
    for (int i = 0; i < 8; ++i) {
        // gotta love weird GL optimizations
        // constant loop bound is big for perf
        if (i >= iHistoryLen || visible) break;
        visible = rectOverlaps(h[i] - halfPxRect, h[i] + halfPxRect, vec2(-1.0), vec2(1.0));
    }

    float nextState = !visible ? 3.0 : (isHit ? 2.0 : 1.0);

    v_posVel = vec4(pos, vel);
    v_meta = vec4(nextState, hitUV, spawnX);
    v_trailMeta = vec4(historyTimer, historyLen, 0.0, 0.0);
    v_hist01 = vec4(h[0], h[1]);
    v_hist23 = vec4(h[2], h[3]);
    v_hist45 = vec4(h[4], h[5]);
    v_hist67 = vec4(h[6], h[7]);
}
