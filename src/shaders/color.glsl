vec3 srgbFromLrgb(vec3 lrgb) {
    bvec3 cutoff = lessThanEqual(lrgb, vec3(0.0031308));
    vec3 lower = lrgb * 12.92;
    vec3 higher = 1.055 * pow(lrgb, vec3(1.0 / 2.4)) - 0.055;
    return mix(higher, lower, cutoff);
}

vec3 lrgbFromSrgb(vec3 srgb) {
    bvec3 cutoff = lessThanEqual(srgb, vec3(0.04045));
    vec3 lower = srgb / 12.92;
    vec3 higher = pow((srgb + 0.055) / 1.055, vec3(2.4));
    return mix(higher, lower, cutoff);
}

vec3 lrgbFromHsv(vec3 hsv) {
    vec3 k = mod(hsv.x / radians(60.0) + vec3(0.0, 4.0, 2.0), 6.0);
    vec3 srgb = hsv.z - hsv.z * hsv.y * clamp(min(k, 4.0 - k), 0.0, 1.0);
    return lrgbFromSrgb(srgb);
}
