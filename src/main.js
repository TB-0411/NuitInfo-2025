import * as THREE from 'three';
import { randInt } from "three/src/math/MathUtils";

const min = 0, max = 2;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// create an AudioListener and add it to the camera
const listener = new THREE.AudioListener();
camera.add(listener);

// create a global audio source
const sound = new THREE.Audio(listener);

// load a sound and set it as the Audio object's buffer
const audioLoader = new THREE.AudioLoader();
audioLoader.load('/resources/sounds/dignity.ogg', function(buffer) {
    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setVolume(1);
    // Do NOT call sound.play() here!
});

const analyser = new THREE.AudioAnalyser(sound, 32);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const cubes = [];
for (let i = 0; i < 30; i++) {
    let x = randInt(min, max),
        y = randInt(min, max),
        z = randInt(min, max);
    const geometry = new THREE.BoxGeometry(x, y, z);
    const material = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
    const cube = new THREE.Mesh(geometry, material);
    cubes.push(cube);
    scene.add(cube);
    cube.position.x += randInt(-3, 3);
    cube.position.y += randInt(-3, 3);
    cube.position.z += randInt(-3, 3);
}
camera.position.z = 5;

// Add a button to start audio
document.getElementById('b-startAudio').addEventListener('click', () => {
    // Resume the AudioContext and play the sound
    const audioContext = listener.context;
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            sound.play();
            renderer.setAnimationLoop(animate);
            console.log("PLAYING")
        });
    }
});

function animate() {
    const data = analyser.getAverageFrequency();
    console.log(data);

    cubes.forEach((cube) => {
        cube.rotation.x += 0.01;
        cube.rotation.y += 0.01;
    });
    renderer.render(scene, camera);
}