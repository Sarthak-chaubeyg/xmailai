/* ================================================================
   XMailAI — Three.js 3D Background Scene
   Animated wireframe geometries + particles + mouse parallax
   ================================================================ */

import * as THREE from 'three';

// ---- Renderer Setup ----
const canvas = document.getElementById('three-canvas');
if (!canvas) throw new Error('Canvas #three-canvas not found');

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.z = 32;

const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// ---- Color Palette (Yellow / Gold) ----
const GOLD = 0xFBBF24;
const AMBER = 0xF59E0B;
const DARK_GOLD = 0xD97706;
const DIM_GOLD = 0xB8860B;

// ---- Primary: Wireframe Icosahedron ----
const icoGeometry = new THREE.IcosahedronGeometry(9, 1);
const icoMaterial = new THREE.MeshBasicMaterial({
    color: GOLD,
    wireframe: true,
    transparent: true,
    opacity: 0.1,
});
const icosahedron = new THREE.Mesh(icoGeometry, icoMaterial);
scene.add(icosahedron);

// ---- Secondary: Wireframe Torus Knot ----
const torusGeometry = new THREE.TorusKnotGeometry(5, 1.5, 80, 12);
const torusMaterial = new THREE.MeshBasicMaterial({
    color: AMBER,
    wireframe: true,
    transparent: true,
    opacity: 0.06,
});
const torusKnot = new THREE.Mesh(torusGeometry, torusMaterial);
torusKnot.position.set(-16, 6, -12);
scene.add(torusKnot);

// ---- Tertiary: Wireframe Dodecahedron ----
const dodecGeometry = new THREE.DodecahedronGeometry(4, 0);
const dodecMaterial = new THREE.MeshBasicMaterial({
    color: DARK_GOLD,
    wireframe: true,
    transparent: true,
    opacity: 0.07,
});
const dodecahedron = new THREE.Mesh(dodecGeometry, dodecMaterial);
dodecahedron.position.set(14, -7, -8);
scene.add(dodecahedron);

// ---- Small accent: Wireframe Octahedron ----
const octaGeometry = new THREE.OctahedronGeometry(2.5, 0);
const octaMaterial = new THREE.MeshBasicMaterial({
    color: GOLD,
    wireframe: true,
    transparent: true,
    opacity: 0.06,
});
const octahedron = new THREE.Mesh(octaGeometry, octaMaterial);
octahedron.position.set(-10, -10, -6);
scene.add(octahedron);

// ---- Particle Field ----
const PARTICLE_COUNT = 180;
const particleGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const sizes = new Float32Array(PARTICLE_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 90;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 70;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 50 - 10;
    sizes[i] = Math.random() * 0.08 + 0.03;
}

particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const particleMaterial = new THREE.PointsMaterial({
    color: DIM_GOLD,
    size: 0.06,
    transparent: true,
    opacity: 0.4,
    sizeAttenuation: true,
    depthWrite: false,
});

const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

// ---- Mouse Tracking ----
let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;

function onMouseMove(e) {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
}

// Use passive listener for performance
window.addEventListener('mousemove', onMouseMove, { passive: true });

// ---- Handle Resize ----
function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

window.addEventListener('resize', onResize, { passive: true });

// ---- Animation Loop ----
const clock = new THREE.Clock();
let isTabVisible = true;

// Pause rendering when tab is hidden (performance)
document.addEventListener('visibilitychange', () => {
    isTabVisible = !document.hidden;
    if (isTabVisible) clock.getDelta(); // Reset delta to avoid time jump
});

function animate() {
    requestAnimationFrame(animate);
    if (!isTabVisible) return;

    const elapsed = clock.getElapsedTime();

    // Smooth mouse interpolation
    targetX += (mouseX - targetX) * 0.015;
    targetY += (mouseY - targetY) * 0.015;

    // Rotate geometries
    icosahedron.rotation.x = elapsed * 0.06 + targetY * 0.25;
    icosahedron.rotation.y = elapsed * 0.09 + targetX * 0.25;

    torusKnot.rotation.x = elapsed * 0.04;
    torusKnot.rotation.y = elapsed * 0.06;
    torusKnot.rotation.z = elapsed * 0.02;

    dodecahedron.rotation.x = elapsed * 0.08;
    dodecahedron.rotation.z = elapsed * 0.05;

    octahedron.rotation.y = elapsed * 0.12;
    octahedron.rotation.x = elapsed * 0.07;

    // Breathing scale on primary shape
    const breathe = 1 + Math.sin(elapsed * 0.4) * 0.025;
    icosahedron.scale.setScalar(breathe);

    // Gentle float on secondary shapes
    torusKnot.position.y = 6 + Math.sin(elapsed * 0.3) * 1.5;
    dodecahedron.position.y = -7 + Math.cos(elapsed * 0.35) * 1.2;
    octahedron.position.x = -10 + Math.sin(elapsed * 0.25) * 0.8;

    // Particle drift
    particles.rotation.y = elapsed * 0.012;
    particles.rotation.x = elapsed * 0.006;

    // Camera parallax
    camera.position.x += (targetX * 2 - camera.position.x) * 0.02;
    camera.position.y += (-targetY * 2 - camera.position.y) * 0.02;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
}

animate();
