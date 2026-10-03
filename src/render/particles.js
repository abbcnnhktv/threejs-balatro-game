import * as THREE from 'three';

const MAX = 1500;

// Pooled additive particle system for bursts, sparks and ambient dust.
export class Particles {
  constructor() {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.baseSize = new Float32Array(MAX);
    this.gravity = new Float32Array(MAX);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;

    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { scale: { value: 300 } },
        vertexShader: /* glsl */ `
          attribute float size;
          attribute float alpha;
          attribute vec3 color;
          uniform float scale;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vColor = color;
            vAlpha = alpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * scale / -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float d = length(p);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
          }
        `,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.ambientTimer = 0;
  }

  spawn(p, v, color, size, life, gravity = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.baseSize[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity[i] = gravity;
  }

  burst(origin, color, count = 40, { speed = 4, size = 0.25, life = 0.9, gravity = -6, intensity = 2.5 } = {}) {
    const c = new THREE.Color(color).multiplyScalar(intensity);
    const v = new THREE.Vector3();
    for (let n = 0; n < count; n++) {
      v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() * 0.6).normalize()
        .multiplyScalar(speed * (0.3 + Math.random()));
      this.spawn(origin, v, c, size * (0.5 + Math.random()), life * (0.6 + Math.random() * 0.6), gravity);
    }
  }

  update(dt) {
    this.ambientTimer -= dt;
    while (this.ambientTimer < 0) {
      this.ambientTimer += 0.06;
      const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.4, 0.8, 0.6).multiplyScalar(0.8);
      this.spawn(
        new THREE.Vector3((Math.random() - 0.5) * 24, -8, -3 - Math.random() * 4),
        new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 1.2, 0),
        c,
        0.08 + Math.random() * 0.12,
        12,
      );
    }

    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const i3 = i * 3;
      this.vel[i3 + 1] += this.gravity[i] * dt;
      const drag = Math.exp(-1.5 * dt);
      this.vel[i3] *= drag;
      this.vel[i3 + 1] *= drag;
      this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, t * 2);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    for (const name of ['position', 'color', 'size', 'alpha']) this.geo.attributes[name].needsUpdate = true;
  }
}
