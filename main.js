import * as THREE from 'three';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8d9c4);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
camera.position.set(0, 8, 0.01);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);

const key = new THREE.DirectionalLight(0xffe2b0, 1.4);
key.position.set(-2, 6, 2);
scene.add(key);
scene.add(new THREE.AmbientLight(0xfff0dc, 0.55));

const jar = new THREE.Mesh(
  new THREE.TorusGeometry(0.92, 0.07, 16, 64),
  new THREE.MeshPhysicalMaterial({
    color: 0xc4784a,
    roughness: 0.45,
    metalness: 0.05,
  }),
);
jar.rotation.x = Math.PI / 2;
jar.position.y = 0.02;
scene.add(jar);

const doughMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uWobble: { value: new THREE.Vector2(0, 0) },
    uColor: { value: new THREE.Color(0xf4ead4) },
  },
  vertexShader: `
    uniform float uTime;
    uniform vec2 uWobble;
    varying vec2 vXZ;
    void addBump(inout float bump, inout vec2 dB, vec2 p, vec2 c, float k) {
      vec2 d = p - c;
      float e = exp(-dot(d, d) * k);
      bump += e;
      dB += e * (-2.0 * k) * d;
    }
    void main() {
      vec3 p = position;
      float n = sin(p.x * 3.2 + uTime * 0.35) * cos(p.z * 2.8 - uTime * 0.28);
      float bump = 0.0;
      vec2 dB = vec2(0.0);
      addBump(bump, dB, p.xz, vec2( 0.20,  0.04), 20.0);
      addBump(bump, dB, p.xz, vec2(-0.10,  0.20), 24.0);
      addBump(bump, dB, p.xz, vec2( 0.06, -0.18), 22.0);
      addBump(bump, dB, p.xz, vec2(-0.26, -0.06), 18.0);
      vXZ = p.xz;
      p += normal * (n * 0.035 - bump * 0.40);
      p.x += uWobble.x * (0.12 + p.z * 0.04);
      p.z += uWobble.y * (0.12 + p.x * 0.04);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    varying vec2 vXZ;
    void addBump(inout float bump, inout vec2 dB, vec2 p, vec2 c, float k) {
      vec2 d = p - c;
      float e = exp(-dot(d, d) * k);
      bump += e;
      dB += e * (-2.0 * k) * d;
    }
    void main() {
      float bump = 0.0;
      vec2 dB = vec2(0.0);
      addBump(bump, dB, vXZ, vec2( 0.20,  0.04), 60.0);
      addBump(bump, dB, vXZ, vec2(-0.10,  0.20), 72.0);
      addBump(bump, dB, vXZ, vec2( 0.06, -0.18), 66.0);
      addBump(bump, dB, vXZ, vec2(-0.26, -0.06), 54.0);
      vec3 n = normalize(vec3(-dB.x * 0.40, 1.0, -dB.y * 0.40));
      vec3 L = normalize(vec3(-0.7, 0.45, 0.45));
      float ndl = max(0.0, dot(n, L));
      float spec = pow(ndl, 28.0);
      float slope = length(n.xz);
      vec3 col = uColor * (0.62 + 0.48 * ndl);
      col += vec3(0.28, 0.16, 0.08) * spec;
      col -= vec3(0.14, 0.10, 0.06) * slope;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

const dough = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 5), doughMat);
dough.position.y = 0.04;
scene.add(dough);

const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
const wobble = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

function onPtr(e) {
  const r = canvas.getBoundingClientRect();
  const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - r.left;
  const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - r.top;
  ptr.x = (x / r.width) * 2 - 1;
  ptr.y = -(y / r.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  if (ray.ray.intersectPlane(plane, hit)) {
    wobble.set(THREE.MathUtils.clamp(hit.x, -1, 1), THREE.MathUtils.clamp(hit.z, -1, 1));
  }
}
canvas.addEventListener('pointerdown', onPtr);
canvas.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') onPtr(e); });

function fit() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  const viewH = 3.4;
  const viewW = viewH * aspect;
  camera.left = -viewW / 2;
  camera.right = viewW / 2;
  camera.bottom = -1.52;
  camera.top = camera.bottom + viewH;
  camera.updateProjectionMatrix();
}
addEventListener('resize', fit);
fit();

const clock = new THREE.Clock();
function frame() {
  const t = clock.getElapsedTime();
  const breathe = 1.0 + 0.04 * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 3.5));
  dough.scale.setScalar(breathe);
  doughMat.uniforms.uTime.value = t;
  wobble.multiplyScalar(0.9);
  doughMat.uniforms.uWobble.value.copy(wobble);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

const recipeEl = document.getElementById('recipe');
const tabLevain = document.getElementById('tab-levain');
const tabRecipe = document.getElementById('tab-recipe');
function showLevain() {
  recipeEl.style.display = 'none';
  tabLevain.classList.add('active');
  tabRecipe.classList.remove('active');
}
function showRecipe() {
  recipeEl.style.display = 'block';
  tabRecipe.classList.add('active');
  tabLevain.classList.remove('active');
}
tabLevain.addEventListener('click', showLevain);
tabRecipe.addEventListener('click', showRecipe);
if (new URLSearchParams(location.search).get('tab') === 'recipe') showRecipe();
