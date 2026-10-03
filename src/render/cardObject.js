import * as THREE from 'three';
import { backTexture, shadowTexture } from './textures.js';

export const CARD_W = 1.6;
export const CARD_H = 2.24;
const DEPTH = 0.035;
const RADIUS = 0.12;

function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const shape = roundedShape(CARD_W, CARD_H, RADIUS);
const faceGeo = new THREE.ShapeGeometry(shape, 6);
{
  // remap UVs from shape coordinates to 0..1
  const pos = faceGeo.attributes.position;
  const uv = faceGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5);
  }
}
const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false, curveSegments: 6 });
bodyGeo.translate(0, 0, -DEPTH / 2);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe9e2d0, roughness: 0.6 });
const shadowGeo = new THREE.PlaneGeometry(CARD_W * 1.25, CARD_H * 1.2);

const faceVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Card face: texture + moving specular sheen + optional foil / holo / polychrome edition.
const faceFragment = /* glsl */ `
  uniform sampler2D map;
  uniform float time;
  uniform vec2 tilt;
  uniform float edition; // 0 none, 1 foil, 2 holo, 3 poly
  uniform float flash;
  uniform float dim;
  uniform float selected;
  varying vec2 vUv;

  vec3 hue(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }

  void main() {
    vec4 tex = texture2D(map, vUv);
    vec3 col = tex.rgb;
    float diag = vUv.x * 0.8 + vUv.y * 1.2 + tilt.x * 1.6 - tilt.y * 1.6;

    // soft glossy band
    float band = smoothstep(0.7, 1.0, sin(diag * 3.2 + 1.3));
    col += vec3(1.0, 0.97, 0.9) * band * 0.08;

    if (edition > 0.5 && edition < 1.5) {
      float f = 0.5 + 0.5 * sin(diag * 14.0 + time * 0.6);
      col = mix(col, col * vec3(0.75, 0.9, 1.25) + vec3(0.05, 0.1, 0.25) * f, 0.6);
      col += vec3(0.5, 0.75, 1.0) * pow(f, 8.0) * 0.35;
    } else if (edition > 1.5 && edition < 2.5) {
      vec3 rb = hue(fract(diag * 0.7 + time * 0.05));
      float grid = step(0.5, fract(vUv.x * 18.0)) * step(0.5, fract(vUv.y * 24.0));
      col = mix(col, col * 0.6 + rb * 0.55, 0.45 + grid * 0.1);
    } else if (edition > 2.5) {
      vec3 rb = hue(fract(diag * 0.5 + vUv.y * 0.6 + time * 0.08));
      col = mix(col, col * rb * 1.5 + rb * 0.15, 0.55);
    }

    col = mix(col, col * vec3(0.55, 0.35, 0.4), dim);
    col += vec3(1.0, 0.95, 0.8) * flash * 0.3;
    col += vec3(1.0, 0.85, 0.4) * selected * 0.04;
    gl_FragColor = vec4(col, tex.a);
    #include <colorspace_fragment>
  }
`;

export function makeFaceMaterial(map, edition = 0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      time: { value: 0 },
      tilt: { value: new THREE.Vector2() },
      edition: { value: edition },
      flash: { value: 0 },
      dim: { value: 0 },
      selected: { value: 0 },
    },
    vertexShader: faceVertex,
    fragmentShader: faceFragment,
    transparent: true,
  });
}

const EDITION_CODE = { foil: 1, holo: 2, poly: 3 };

/**
 * A 3D card that springs toward a target transform.
 * `data` is whatever the game associates with the card (playing card, joker instance, shop item).
 */
export class CardObject {
  constructor({ texture, data, kind = 'card', edition = null, faceDown = false }) {
    this.data = data;
    this.kind = kind;
    this.group = new THREE.Group();
    this.pivot = new THREE.Group(); // inner group for tilt / wobble
    this.group.add(this.pivot);

    this.faceMat = makeFaceMaterial(texture, EDITION_CODE[edition] ?? 0);
    this.front = new THREE.Mesh(faceGeo, this.faceMat);
    this.front.position.z = DEPTH / 2 + 0.002;
    this.front.userData.cardObject = this;

    this.body = new THREE.Mesh(bodyGeo, bodyMat);

    this.back = new THREE.Mesh(faceGeo, makeFaceMaterial(backTexture()));
    this.back.rotation.y = Math.PI;
    this.back.position.z = -DEPTH / 2 - 0.002;

    this.pivot.add(this.body, this.front, this.back);

    this.shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.shadow.renderOrder = -1;

    // targets
    this.target = {
      pos: new THREE.Vector3(),
      rotZ: 0,
      flip: faceDown ? Math.PI : 0,
      scale: 1,
    };
    this.flip = this.target.flip;
    this.tilt = new THREE.Vector2();
    this.tiltTarget = new THREE.Vector2();
    this.hovered = false;
    this.selected = false;
    this.punch = 0; // scale impulse
    this.punchVel = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.speed = 10;
    this.interactive = true;
  }

  addTo(scene) {
    scene.add(this.group);
    scene.add(this.shadow);
  }

  removeFrom(scene) {
    scene.remove(this.group);
    scene.remove(this.shadow);
    this.faceMat.dispose();
    this.back.material.dispose();
    this.shadow.material.dispose();
  }

  snap() {
    this.group.position.copy(this.target.pos);
    this.group.rotation.z = this.target.rotZ;
    this.group.scale.setScalar(this.target.scale);
    this.flip = this.target.flip;
  }

  setTarget(pos, rotZ = 0, scale = 1) {
    this.target.pos.copy(pos);
    this.target.rotZ = rotZ;
    this.target.scale = scale;
  }

  bump(amount = 0.35) {
    this.punchVel += amount * 14;
  }

  update(dt, time) {
    const k = 1 - Math.exp(-this.speed * dt);
    const g = this.group;
    g.position.lerp(this.target.pos, k);
    g.rotation.z += (this.target.rotZ - g.rotation.z) * k;
    this.flip += (this.target.flip - this.flip) * (1 - Math.exp(-8 * dt));

    // spring for "punch" scale impulses
    this.punchVel += (-this.punch * 260 - this.punchVel * 16) * dt;
    this.punch += this.punchVel * dt;
    const hoverScale = this.hovered ? 1.08 : 1;
    const s = g.scale.x + (this.target.scale * hoverScale - g.scale.x) * k;
    g.scale.setScalar(s);
    this.pivot.scale.setScalar(1 + this.punch);

    // idle wobble + hover tilt
    this.tilt.lerp(this.tiltTarget, 1 - Math.exp(-10 * dt));
    const wob = this.hovered ? 0 : 0.045;
    this.pivot.rotation.x = -this.tilt.y * 0.5 + Math.sin(time * 1.3 + this.phase) * wob;
    this.pivot.rotation.y = this.flip + this.tilt.x * 0.5 + Math.cos(time * 1.1 + this.phase) * wob;

    const u = this.faceMat.uniforms;
    u.time.value = time;
    u.tilt.value.set(this.pivot.rotation.y - this.flip + g.position.x * 0.04, this.pivot.rotation.x);
    u.flash.value = Math.max(0, u.flash.value - dt * 3);
    u.selected.value += ((this.selected ? 1 : 0) - u.selected.value) * k;

    // drop shadow grows/softens as the card lifts toward the camera
    const lift = g.position.z;
    this.shadow.position.set(g.position.x + 0.12 + lift * 0.1, g.position.y - 0.18 - lift * 0.12, g.position.z - 0.25 - lift * 0.4);
    this.shadow.rotation.z = g.rotation.z;
    this.shadow.scale.setScalar(s * (1 + lift * 0.05));
    this.shadow.material.opacity = Math.max(0.15, 0.5 - lift * 0.1) * (this.shadowHidden ? 0 : 1);
  }
}
