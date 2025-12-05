import * as THREE from "three";

const ORIGIN = 0
export function createCuboid(size_x, size_y, size_z, hex_color=0x000000) {
    const geometry = new THREE.BoxGeometry(size_x,size_y,size_z);
    const material = new THREE.MeshPhongMaterial({
        color: hex_color,
        shininess: 100
    });
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