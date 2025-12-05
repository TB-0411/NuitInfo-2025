import * as THREE from 'three';
import * as GEOMETRY from '../src/geometry';
import { randInt } from "three/src/math/MathUtils";
import {OrbitControls} from "three/addons";

const audioExt = '.ogg'
const audioSource = 'resources/sounds/dignity'+audioExt

let previousShadowMap = false;
const params = {
    shadows: true,
    exposure: 1,
    bulbPower: 2000,
    hemiIrradiance: 10
};

const minSize = 1, maxSize = 10;
const minPos = -30, maxPos = 30, excludedPosRange = 5;
const spawnPos = -100, spawnRange = 100
const SHAPE_COUNT = 200;
const VERTEX_COUNT = 1024; // 1024

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2( 0x000000, 0.01 );
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

// # Lights
const bulbLight = new THREE.PointLight( 0x00FF00, 100, 0, 0);

bulbLight.position.set( 0, 0, 0 );
bulbLight.castShadow = true;

scene.add(bulbLight)

// # Audio
// create an AudioListener and add it to the camera
const listener = new THREE.AudioListener();
camera.add(listener);

// load a sound and set it as the Audio object's buffer
const audioLoader = new THREE.AudioLoader();
const audio = new THREE.Audio( listener );
audioLoader.load(audioSource, function(buffer) {
    audio.setBuffer(buffer);
    audio.setLoop(true);
    audio.setVolume(1);
});

const analyser = new THREE.AudioAnalyser( audio, VERTEX_COUNT*2 );


const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ReinhardToneMapping;
document.body.appendChild(renderer.domElement);

// # Controls
const controls = new OrbitControls( camera, renderer.domElement );
controls.minDistance = 1;
controls.maxDistance = 20;

window.addEventListener( 'resize', onWindowResize );

function randIntIntersect(min, max, excluded) {
    if (randInt(0, 1) === 0) {
        return randInt(min, excluded)
    } else {
        return randInt(excluded, max)
    }
}

const cubexs = [];
for (let i = 0; i < SHAPE_COUNT; i++) {
    let x = randInt(minSize, maxSize)
    let cubex = GEOMETRY.createCuboid(x,x,x, {color: 0x404040});

    cubex.mesh.position.x = randIntIntersect(minPos, maxPos, excludedPosRange)
    cubex.mesh.position.y = randIntIntersect(minPos, maxPos, excludedPosRange)
    cubex.mesh.position.z = randInt(spawnPos, spawnPos +spawnRange);

    cubex.origin_pos = cubex.mesh.position.clone();

    cubexs.push( cubex );
    scene.add(cubex.mesh);
}

const RADIUS = 5; // Define the radius of the circle


const vertexs = []

// Calculate the angle increment between each vertex
// 2 * PI is a full circle (360 degrees in radians)
const angleIncrement = (2 * Math.PI) / VERTEX_COUNT;
const VERTEX_WIDTH = 0.05

for (let i = 0; i < VERTEX_COUNT; i++) {
    let x_size = VERTEX_WIDTH;
    let y_size = 0.1;
    let z_size = VERTEX_WIDTH;

    // Calculate the current angle in radians
    const angle = i * angleIncrement;

    // Use Math.cos() for the X position and Math.sin() for the Z position
    // (This places the circle on the XZ plane)
    const posX = RADIUS * Math.cos(angle);
    const posZ = RADIUS * Math.sin(angle);

    // Assuming GEOMETRY.createCuboid returns an object with a 'mesh' property
    const vertex = GEOMETRY.createCuboid(x_size, y_size, z_size,
        {color: 0x404040,
        emissive: 0xFF0000,
        emissiveIntensity: 1});

    // Set the calculated circular position
    vertex.mesh.position.x = posX;
    vertex.mesh.position.y = posZ; // Keep Y at 0 unless you want a 3D ring
    vertex.mesh.rotation.z = angle + Math.PI/2;
    vertex.mesh.position.z = 0;

    // Store the origin position for animation later
    vertex.origin_pos = vertex.mesh.position.clone();

    vertexs.push(vertex)
    scene.add(vertex.mesh);
}

camera.position.z = 10;

// Add a button to start audio
document.getElementById('b-startAudio').addEventListener('click', () => {
    // Resume the AudioContext and play the sound
    const audioContext = listener.context;

    // Check if the sound buffer has been set.
    if (!audio.buffer) {
        console.error("Audio buffer not yet loaded!");
        return; // Exit if the buffer is somehow missing
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            audio.play();
            renderer.setAnimationLoop(animate);
        }).catch(err => {
            console.error("Failed to resume AudioContext:", err);
        });
        console.log("Play attempted");
    } else if (audioContext.state === 'running') {
        audio.play();
        renderer.setAnimationLoop(animate);
    }
});

const LOW_BAND_END = Math.floor(VERTEX_COUNT * 0.20);   // First 20% (Bass)
const MID_BAND_END = Math.floor(VERTEX_COUNT * 0.65);   // Next 45% (Mids)

// Scaling factor for the color calculation (limits max RGB channel value)
const COLOR_NORMALIZATION_FACTOR = 1500;
function getBandEnergy(data, start, end) {
    let sum = 0;
    for (let i = start; i < end; i++) {
        sum += data[i];
    }
    // Return the sum (don't average it yet)
    return sum;
}

console.log(vertexs.mesh)

let factor = 1;
let step = 0;
const AVERAGE_FREQUENCY_CLAMP = 80
// Add a constant for smoothing strength (0.1 to 0.5 is a good starting range)
const SPEED = 0.1
const SMOOTHING_FACTOR = 0.3;
const CAMERA_ROTATION_SPEED = 0.00001; // Dramatically reduced base speed
// Define a maximum scale factor for the audio effect
const MAX_DISPLACEMENT = 10.0;
const SENSITIVITY = 1.; // Use a different divisor/multiplier for finer control

const HUE_SPEED = 0.001; // Controls the speed of the color cycle (smaller is slower)
const HUE_SPREAD = 0.001; // Controls how much the color differs between adjacent vertices
function animate() {
    //
    // U / Light
    renderer.toneMappingExposure = Math.pow( params.exposure, 5.0 );
    renderer.shadowMap.enabled = params.shadows;
    bulbLight.castShadow = params.shadows;

    if ( params.shadows !== previousShadowMap ) {
        previousShadowMap = params.shadows;
    }
    // U / Audio
    let frequencies = analyser.getFrequencyData();
    let averageFrequency = analyser.getAverageFrequency();
    if (averageFrequency === 0) { averageFrequency = AVERAGE_FREQUENCY_CLAMP; }
    // Calculate the target rotation based on the current average frequency
    // Since rotation changes constantly, use a small constant * factor
    const targetRotationZ = (averageFrequency * factor * CAMERA_ROTATION_SPEED);
    let rawDisplacement = averageFrequency - AVERAGE_FREQUENCY_CLAMP;
    let clampedDisplacement = Math.max(rawDisplacement, 0);
    let audioEffect = Math.min(MAX_DISPLACEMENT, clampedDisplacement * SENSITIVITY);

    // Interpolate the camera's rotation towards the target value
    // This makes the rotation "catch up" to the beat gradually
    camera.rotation.z += (targetRotationZ - camera.rotation.z) * SMOOTHING_FACTOR;


    cubexs.forEach((cubex) => {

        const targetZ = cubex.mesh.position.z + audioEffect;

        // Smoothly move the current Z position towards the target Z position
        cubex.mesh.position.z += (targetZ - cubex.mesh.position.z) * SPEED;
        cubex.mesh.position.x += cubex.mesh.position.x/10 * SPEED;
        cubex.mesh.position.y += cubex.mesh.position.y/10 * SPEED;

        if (cubex.mesh.position.z >= 0) {
            cubex.mesh.position.z = spawnPos;
            cubex.mesh.position.y = randIntIntersect(minPos, maxPos, 1)
            cubex.mesh.position.x = randIntIntersect(minPos, maxPos, 1)
        }

        cubex.mesh.rotation.x += 0.01;
        cubex.mesh.rotation.y += 0.01;
    });

    for (let i = 0; i < VERTEX_COUNT/2+1; i++) {
        let frequency = frequencies[i];
        if (frequency === 0 || isNaN(frequency)) {
            frequency = 10
        }
        // Calculate the target scale Y
        const targetScaleY = frequency / 10;

        // Colors

        const timeHue = step * HUE_SPEED;
        // HUE_SPREAD ensures each vertex has a slightly different color (phasing effect).
        // The modulo 1 keeps the value between 0.0 and 1.0 (a full circle).
        const hue = (timeHue + i * HUE_SPREAD) % 1;

        // Saturation (1.0) and Lightness (0.5) create pure, vibrant colors.
        vertexs[i].mesh.material.emissive.setHSL(hue, 1.0, 0.5);
        vertexs[i].mesh.scale.y += (targetScaleY - vertexs[i].mesh.scale.y) * SMOOTHING_FACTOR;
        if (i !== 0) {
            vertexs[vertexs.length-i].mesh.material.emissive.setHSL(hue, 1.0, 0.5);
            vertexs[vertexs.length-i].mesh.scale.y +=
                (targetScaleY - vertexs[vertexs.length-i].mesh.scale.y) * SMOOTHING_FACTOR;
        }
    }

    step ++;
    if (step % 10 === 0) { factor = -factor }

    renderer.render(scene, camera);
}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );

}