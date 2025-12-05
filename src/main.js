import * as THREE from 'three';
import { randInt } from "three/src/math/MathUtils";
import { OrbitControls } from "three/addons";

// --- Configuration Constants ---

// Audio
const AUDIO_EXT = '.ogg';
const AUDIO_SOURCE = 'resources/sounds/dignity' + AUDIO_EXT;
const SAMPLE_RATE = 44100; // Standard Web Audio sample rate
const BASS_FREQUENCY_LIMIT = 252; // The frequency cutoff for bass (in Hz)

// Scene/Geometry
const SHAPE_COUNT = 200;
const VERTEX_COUNT = 256; // Defines audio analyser FFT size and circle resolution
const RADIUS = 5; // Radius of the frequency visualizer circle
const VERTEX_WIDTH = 0.05;

// Spawning Range
const MIN_SIZE = 1, MAX_SIZE = 7;
const MIN_POS = -30, MAX_POS = 30, EXCLUDED_POS_RANGE = 5;
const SPAWN_POS = -300, SPAWN_RANGE = 290;

// Animation/Visuals
const AVERAGE_FREQUENCY_CLAMP = 80;
const VERTEX_SCALE = 1.3;
const VERTEX_BASS_ESCAPE = 0.01
const SMOOTHING_FACTOR = 0.4;
const CAMERA_ROTATION_SPEED = 0.0001;
const MAX_DISPLACEMENT = 20.0 * SMOOTHING_FACTOR;
const SENSITIVITY = 1;
const HUE_SPEED = 0.001;
const HUE_SPREAD = 0.001;
const FFT_SIZE = VERTEX_COUNT * 2; // Analyser size based on vertex count

// Initial Parameters (Mutable)
const PARAMS = {
    shadows: true,
    exposure: 1,
    bulbPower: 2000,
    hemiIrradiance: 10
};
let previousShadowMap = false;

// --- Utility Functions️ ---

/**
 * Generates a random integer, excluding a range around 0.
 */
function randIntIntersect(min, max, excluded) {
    if (randInt(0, 1) === 0) {
        return randInt(min, -excluded);
    } else {
        return randInt(excluded, max);
    }
}

// Calculate the array index that marks the end of the bass range
const FREQ_RESOLUTION = SAMPLE_RATE / FFT_SIZE;
const BASS_INDEX_END = Math.floor(BASS_FREQUENCY_LIMIT / FREQ_RESOLUTION);

/**
 * Calculates the average energy in the bass frequency range.
 */
function getBassEnergy(frequencies) {
    let bassSum = 0;
    // Sum the energy from index 0 up to the calculated end index
    for (let i = 0; i < BASS_INDEX_END; i++) {
        bassSum += frequencies[i];
    }
    // Divide by the number of indices to get the average bass volume
    return bassSum / BASS_INDEX_END;
}

// --- Scene and Renderer Setup ---

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.005);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.z = 15;

const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ReinhardToneMapping;
document.body.appendChild(renderer.domElement);

// --- Lights 💡 ---

const bulbLight = new THREE.PointLight(0x00FF00, 100, 0, 0);
bulbLight.position.set(0, 0, 0);
bulbLight.castShadow = true;
scene.add(bulbLight);

// --- Audio Setup 🎧 ---

const listener = new THREE.AudioListener();
camera.add(listener);

const audioLoader = new THREE.AudioLoader();
const audio = new THREE.Audio(listener);
const analyser = new THREE.AudioAnalyser(audio, FFT_SIZE);

audioLoader.load(AUDIO_SOURCE, function (buffer) {
    audio.setBuffer(buffer);
    audio.setLoop(true);
    audio.setVolume(1);
});

// --- Controls and Event Listeners️ ---

const controls = new OrbitControls(camera, renderer.domElement);
controls.minDistance = 1;
controls.maxDistance = 20;
controls.enableRotate = false; // Prevents orbiting/rotation
controls.enableZoom = false;   // Prevents zooming/dollying
controls.enableDamping = true; // Essential for smooth movement, we will use it for centering
controls.dampingFactor = 0.05;

controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN
};

let isPanning = false;

function onPointerDown(event) {
    if (event.button === 2) { // Right mouse button
        event.preventDefault(); // Prevent context menu
        isPanning = true;
    }
}

function onPointerUp(event) {
    if (event.button === 2) { // Right mouse button
        isPanning = false;
    }
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointerup', onPointerUp);
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault()); // Always prevent context menu on right-click

window.addEventListener('resize', onWindowResize);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Geometry Initialization ---

function createCuboid(size_x, size_y, size_z, params={color : 0x404040}) {
    const geometry = new THREE.BoxGeometry(size_x,size_y,size_z);
    const material = new THREE.MeshStandardMaterial(params);
    const cuboid = {
        origin_pos: null,
        origin_scale: null,
        mesh: new THREE.Mesh(geometry, material),
    };
    cuboid.mesh.castShadow = true;
    cuboid.mesh.receiveShadow = true;
    cuboid.origin_scale = cuboid.mesh.scale.clone()
    cuboid.origin_pos = cuboid.mesh.position.clone()

    return cuboid;
}

// Spawning background cubes
const cubexs = [];
for (let i = 0; i < SHAPE_COUNT; i++) {
    let x = randInt(MIN_SIZE, MAX_SIZE);
    let cubex = createCuboid(x, x, x, { color: 0x404040 });

    cubex.mesh.position.x = randIntIntersect(MIN_POS, MAX_POS, EXCLUDED_POS_RANGE);
    cubex.mesh.position.y = randIntIntersect(MIN_POS, MAX_POS, EXCLUDED_POS_RANGE);
    cubex.mesh.position.z = randInt(SPAWN_POS, SPAWN_POS + SPAWN_RANGE) - 100;

    cubex.origin_pos = cubex.mesh.position.clone();

    cubexs.push(cubex);
    scene.add(cubex.mesh);
}

// Frequency visualizer circle vertices
const circleGroup = new THREE.Group();
scene.add(circleGroup);
const vertexs = [];

// Calculate the angle increment between each vertex
const angleIncrement = (2 * Math.PI) / VERTEX_COUNT;

for (let i = 0; i < VERTEX_COUNT; i++) {
    const x_size = VERTEX_WIDTH;
    const y_size = 0.1;
    const z_size = VERTEX_WIDTH;

    const angle = i * angleIncrement;

    const posX = RADIUS * Math.cos(angle);
    const posZ = RADIUS * Math.sin(angle);

    const vertex = createCuboid(x_size, y_size, z_size,
        {
            color: 0x404040,
            emissive: 0xFF0000,
            emissiveIntensity: 1
        });

    vertex.mesh.position.x = posX;
    vertex.mesh.position.y = posZ;
    vertex.mesh.rotation.z = angle + Math.PI / 2;
    vertex.mesh.position.z = 0;

    vertex.origin_pos = vertex.mesh.position.clone();

    vertexs.push(vertex);
    circleGroup.add(vertex.mesh);
}

circleGroup.rotation.z -= Math.PI / 2;

// --- Audio Player Interface  ---

function updatePlayPauseButton(isPaused) {
    const button = document.getElementById('b-playPauseAudio');
    if (button) {
        button.innerHTML = isPaused ? '▶ Play' : '⏸ Pause';
    }
}

const RESOURCE_ROOT = "./resources/sounds"

document.body.insertAdjacentHTML('beforeend', `
    <div id="audio-ui" style="position: fixed; bottom: 0; left: 0; width: 100%; height: 50px; 
        background: #282828; 
        padding: 0 20px;
        box-sizing: border-box;
        display: flex; align-items: center; justify-content: space-between; 
        color: white; font-family: sans-serif; z-index: 100;">

        <div style="display: flex; align-items: center; width: 30%;">
            <button id="b-playPauseAudio" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer;">
                ▶ Play
            </button>
            
            <div id="time-display" style="margin-left: 10px; font-size: 12px; color: #aaa;">0:00 / 0:00</div>
            
            <div id="current-track-name" style="margin-left: 15px; font-size: 14px;">
                ${AUDIO_SOURCE.split('/').pop()}
            </div>
        </div>
        
        <div style="width: 40%; display: flex; align-items: center; justify-content: center;">
             <label for="song-selector" style="margin-right: 10px; font-size: 12px; color: #aaa;">Song:</label>
             <select id="song-selector" style="padding: 3px; border-radius: 2px; background: #444; color: white; border: none;">
                <option value="resources/sounds/dignity.ogg">Dignity - Alzando (Synth)</option>
                <option value="resources/sounds/horizon.mp3">Bring_Me_The_Horizon feat. BABYMETAL- Kingslayer (Metal)</option>
                <option value="resources/sounds/retro.mp3">Retro - someone (8bits)</option>
                <option value="resources/sounds/dontyouwalkaway.mp3">Don't you walk away - Astron (Calm Reviving)</option>
            </select>
            
            <input type="file" id="file-input" accept=".mp3, .ogg" style="margin-left: 15px; background: #444; padding: 3px; border-radius: 2px; font-size: 12px; color: white;">
            
        </div>

        <div style="display: flex; align-items: center; width: 30%; justify-content: flex-end;">
            <label for="volume-slider" style="margin-right: 10px; font-size: 14px;">Volume:</label>
            <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="1" style="width: 80px;">
        </div>

        <button id="b-startAudio" style="display: none;"></button>
    </div>
`);

const playPauseButton = document.getElementById('b-playPauseAudio');
const volumeSlider = document.getElementById('volume-slider');
const songSelector = document.getElementById('song-selector');
const fileInput = document.getElementById('file-input');
const currentTrackNameDiv = document.getElementById('current-track-name');

let animationRunning = false;
let audioIsLoaded = false;
function startPlayback() {
    audio.play();
    animationRunning = true;
    renderer.setAnimationLoop(animate);
    updatePlayPauseButton(false);
    console.log("Audio Playback Resumed/Started");
}

function pausePlayback() {
    audio.pause();
    renderer.setAnimationLoop(null);
    animationRunning = false;
    updatePlayPauseButton(true);
    console.log("Audio Playback Paused");
}

function loadNewAudio(source, displayName) {
    pausePlayback();

    audioIsLoaded = false;
    playPauseButton.innerHTML = 'Loading...';

    audioLoader.load(source, function(buffer) {
            audio.setBuffer(buffer);

            currentTrackNameDiv.innerHTML = `${displayName}`;

            audioIsLoaded = true;
            updatePlayPauseButton(true);
        },
        undefined,
        function(err) {
            console.error("Error loading audio file:", err);
            currentTrackNameDiv.innerHTML = `Loading Error!`;
            updatePlayPauseButton(true);
        });
}


audioLoader.load(AUDIO_SOURCE, function (buffer) {
    audio.setBuffer(buffer);
    audio.setLoop(true);
    audio.setVolume(1);
    audioIsLoaded = true;
    updatePlayPauseButton(true);

    playPauseButton.addEventListener('click', () => {
        const audioContext = listener.context;

        if (!audioIsLoaded) return;

        if (animationRunning) {
            pausePlayback();
        } else {

            if (audioContext.state === 'suspended') {
                if (document.getElementById('Warning')) {
                    document.getElementById('Warning').remove();
                }
                audioContext.resume().then(startPlayback);
            } else {
                startPlayback();
            }
        }
    });
});

// Listeners
volumeSlider.addEventListener('input', (event) => {
    audio.setVolume(parseFloat(event.target.value));
});

songSelector.addEventListener('change', (event) => {
    const newSource = event.target.value;
    loadNewAudio(newSource, newSource.split('/').pop());
});


fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const fileUrl = URL.createObjectURL(file);

        // Pass the temporary URL to loadNewAudio
        loadNewAudio(fileUrl, file.name + ' (Local)');
    }
});



// --- Animation Loop ---

let camera_turn_factor = 1;
let step = 0;

/**
 * Helper function to apply visual changes to a vertex.
 */
function setVertexScaleAndColor(vtx, targetScale, intensity = 1, hueValue) {
    vtx.mesh.material.emissive.setHSL(hueValue, 1.0, 0.5);
    vtx.mesh.material.emissiveIntensity = intensity;
    vtx.mesh.scale.y += (targetScale - vtx.mesh.scale.y) * VERTEX_SCALE;
}

function animate() {
    // Update renderer/light parameters
    renderer.toneMappingExposure = Math.pow(PARAMS.exposure, 5.0);
    renderer.shadowMap.enabled = PARAMS.shadows;
    bulbLight.castShadow = PARAMS.shadows;

    if (PARAMS.shadows !== previousShadowMap) {
        previousShadowMap = PARAMS.shadows;
    }

    // Audio Analysis
    const frequencies = analyser.getFrequencyData();
    let averageFrequency = analyser.getAverageFrequency();
    if (averageFrequency === 0) { averageFrequency = AVERAGE_FREQUENCY_CLAMP; }

    const bassFrequency = getBassEnergy(frequencies);
    const hasBass = bassFrequency > BASS_FREQUENCY_LIMIT;

    // Camera Rotation / Audio Effect Calculation
    const targetRotationZ = (averageFrequency * camera_turn_factor * CAMERA_ROTATION_SPEED);
    const rawDisplacement = averageFrequency - AVERAGE_FREQUENCY_CLAMP;
    const clampedDisplacement = Math.max(rawDisplacement, 0);
    const audioEffect = Math.min(MAX_DISPLACEMENT, clampedDisplacement * SENSITIVITY);

    // Camera movement
    camera.rotation.z += (targetRotationZ - camera.rotation.z) * SMOOTHING_FACTOR;
    if (hasBass) {
        camera.rotation.z += (targetRotationZ - camera.rotation.z) * SMOOTHING_FACTOR * 3
    }

    const timeHue = step * HUE_SPEED;

    // Animate background cubes
    cubexs.forEach((cubex) => {
        const targetZ = cubex.mesh.position.z + audioEffect;

        cubex.mesh.position.z += (targetZ - cubex.mesh.position.z) * SMOOTHING_FACTOR;
        cubex.mesh.position.x += cubex.mesh.position.x / 300 * SMOOTHING_FACTOR;
        cubex.mesh.position.y += cubex.mesh.position.y / 300 * SMOOTHING_FACTOR;

        if (cubex.mesh.position.z >= 0) {
            cubex.mesh.position.z = SPAWN_POS;
            cubex.mesh.position.y = randIntIntersect(MIN_POS, MAX_POS, EXCLUDED_POS_RANGE);
            cubex.mesh.position.x = randIntIntersect(MIN_POS, MAX_POS, EXCLUDED_POS_RANGE);
        }

        cubex.mesh.material.emissive.setHSL(timeHue, 1.0, 0.5);
        cubex.mesh.rotation.x += 0.01;
        cubex.mesh.rotation.y += 0.01;
    });

    // Animate frequency visualizer vertices
    for (let i = 0; i < VERTEX_COUNT / 2 + 1; i++) {
        let frequency = frequencies[i];
        if (frequency === 0 || isNaN(frequency)) {
            frequency = 10;
        }

        const hue = (timeHue + i * HUE_SPREAD) % 1;
        const targetScaleY = frequency / 8;

        // Apply a stronger effect to bass-related frequencies
        const isBassAffectedRange = i < VERTEX_COUNT / 2 - VERTEX_COUNT / 16 * 3 && i > VERTEX_COUNT / 16 * 3;

        if (hasBass && isBassAffectedRange) {
            setVertexScaleAndColor(vertexs[i], targetScaleY * 3, 100, hue);
            vertexs[i].mesh.position.y += VERTEX_BASS_ESCAPE;

            if (i !== 0) {
                vertexs[vertexs.length - i].mesh.position.y -= VERTEX_BASS_ESCAPE;
                setVertexScaleAndColor(vertexs[vertexs.length - i], targetScaleY * 3, 100, hue);
            }
        } else {
            vertexs[i].mesh.position.y += (vertexs[i].origin_pos.y - vertexs[i].mesh.position.y) * VERTEX_SCALE;
            setVertexScaleAndColor(vertexs[i], targetScaleY, targetScaleY / 20, hue);
            if (i !== 0) {
                vertexs[vertexs.length - i].mesh.position.y += (vertexs[vertexs.length - i].origin_pos.y - vertexs[vertexs.length - i].mesh.position.y) * VERTEX_SCALE;
                setVertexScaleAndColor(vertexs[vertexs.length - i], targetScaleY, targetScaleY / 20, hue);
            }
        }
    }

    step++;
    if (step % 10 === 0) { camera_turn_factor = -camera_turn_factor; }

    renderer.render(scene, camera);
}