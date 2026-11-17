#version 300 es
precision lowp float;

out vec4 fragColor;

void main() {
    // if there's a ball within the texture, that part of the texture can be unconditionally deleted!
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
