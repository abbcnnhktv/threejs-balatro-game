import * as THREE from 'three';

// Full-screen psychedelic paint swirl with a pixel filter. Colours lerp when the blind changes.
const frag = /* glsl */ `
  uniform float time;
  uniform vec2 resolution;
  uniform vec3 colA;
  uniform vec3 colB;
  uniform vec3 colC;
  uniform float spin;
  uniform float pulse;
  varying vec2 vUv;

  void main() {
    float pixel = max(4.0, length(resolution) / 260.0);
    vec2 frag = floor(vUv * resolution / pixel) * pixel;
    vec2 uv = (frag - 0.5 * resolution) / length(resolution);

    float r = length(uv);
    float a = atan(uv.y, uv.x) + spin * (0.35 - r) * 6.0 + time * 0.05;
    uv = vec2(cos(a), sin(a)) * r;
    uv *= 26.0;

    float t = time * 0.9;
    vec2 uv2 = vec2(uv.x + uv.y);
    for (int i = 0; i < 5; i++) {
      uv2 += sin(max(uv.x, uv.y)) + uv;
      uv += 0.5 * vec2(cos(5.11 + 0.353 * uv2.y + t * 0.131), sin(uv2.x - 0.113 * t));
      uv -= cos(uv.x + uv.y) - sin(uv.x * 0.711 - uv.y);
    }

    float paint = min(2.0, max(0.0, length(uv) * 0.035 * 1.6));
    float c1p = max(0.0, 1.0 - 2.0 * abs(1.0 - paint));
    float c2p = max(0.0, 1.0 - 2.0 * abs(paint));
    float c3p = 1.0 - min(1.0, c1p + c2p);
    vec3 col = colA * c1p + colB * c2p + colC * c3p;

    // vignette + darken so cards pop
    float vig = smoothstep(1.1, 0.25, length(vUv - 0.5) * 1.6);
    col *= (0.45 + 0.25 * vig) * (1.0 + pulse * 0.6);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export class Background {
  constructor() {
    this.uniforms = {
      time: { value: 0 },
      resolution: { value: new THREE.Vector2(1, 1) },
      colA: { value: new THREE.Color('#2f6fed') },
      colB: { value: new THREE.Color('#1d3557') },
      colC: { value: new THREE.Color('#0b132b') },
      spin: { value: 0.4 },
      pulse: { value: 0 },
    };
    this.targets = {
      colA: this.uniforms.colA.value.clone(),
      colB: this.uniforms.colB.value.clone(),
      colC: this.uniforms.colC.value.clone(),
    };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
        `,
        fragmentShader: frag,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.spinTarget = 0.4;
  }

  setColors(a, b, c) {
    this.targets.colA.set(a);
    this.targets.colB.set(b);
    this.targets.colC.set(c);
  }

  setSize(w, h) {
    this.uniforms.resolution.value.set(w, h);
  }

  update(dt, time) {
    const k = 1 - Math.exp(-2 * dt);
    const u = this.uniforms;
    u.time.value = time;
    u.colA.value.lerp(this.targets.colA, k);
    u.colB.value.lerp(this.targets.colB, k);
    u.colC.value.lerp(this.targets.colC, k);
    u.spin.value += (this.spinTarget - u.spin.value) * k;
    u.pulse.value = Math.max(0, u.pulse.value - dt * 1.5);
  }
}
