import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as dat from "dat.gui";

let scene, camera, renderer, controls;
let drone, velocity;
let throttle = 0,
  roll = 0,
  pitch = 0,
  yaw = 0;
const gravity = -0.005;
const throttleStrength = 0.02;
const rotationSpeed = 0.02;
const airFriction = 0.98;
let isFPV = false;
let isLevelMode = true;

// Paramètres de la caméra FPV et des commandes
let fpvSettings = {
  fov: 75,
  angle: 0,
};

// Indicateur de mode
const modeIndicator = document.createElement("div");
modeIndicator.style.position = "absolute";
modeIndicator.style.top = "10px";
modeIndicator.style.left = "10px";
modeIndicator.style.color = "white";
modeIndicator.style.fontSize = "16px";
modeIndicator.style.fontFamily = "Arial, sans-serif";
modeIndicator.innerText = "Mode: Level";
document.body.appendChild(modeIndicator);

// Initialisation des contrôles dat.GUI
const gui = new dat.GUI();
const fovControl = gui
  .add(fpvSettings, "fov", 50, 120)
  .step(1)
  .onChange(updateFpvCameraSettings);
const angleControl = gui
  .add(fpvSettings, "angle", -Math.PI / 4, Math.PI / 4)
  .step(0.01)
  .onChange(updateFpvCameraSettings);

function toggleGuiControls(enabled) {
  const controls = [fovControl, angleControl];
  controls.forEach((control) => {
    const domElement = control.domElement.parentNode;
    if (enabled) {
      domElement.removeAttribute("disabled");
      domElement.style.pointerEvents = "auto";
      domElement.style.opacity = "1";
    } else {
      domElement.setAttribute("disabled", "");
      domElement.style.pointerEvents = "none";
      domElement.style.opacity = "0.5";
    }
  });
}

toggleGuiControls(false);

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  camera = new THREE.PerspectiveCamera(
    fpvSettings.fov,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(10, 10, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0);
  controls.update();

  // Lumières
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 5);
  scene.add(directionalLight);

  // #region Sol et bâtiments
  // Charge la texture pour le sol
  const textureLoader = new THREE.TextureLoader();
  const groundTexture = textureLoader.load("public/ground.jpg"); // Remplace 'path/to/your/texture.jpg' par le chemin vers ta texture
  groundTexture.wrapS = THREE.RepeatWrapping;
  groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(2, 4); // Ajuste le nombre de répétitions pour une texture plus large

  // Applique la texture au matériau du sol
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: groundTexture,
  });

  // Crée le sol
  const groundGeometry = new THREE.PlaneGeometry(200, 200);
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  function createBuildings() {
    const textureLoader = new THREE.TextureLoader();
    const buildingTexture = textureLoader.load("public/building.jpg"); // Remplace par le chemin de ta texture

    for (let i = 0; i < 20; i++) {
      const width = Math.random() * 4 + 2; // Largeur aléatoire
      const height = Math.random() * 20 + 10; // Hauteur aléatoire
      const depth = Math.random() * 4 + 2; // Profondeur aléatoire
      const buildingGeometry = new THREE.BoxGeometry(width, height, depth);

      // Ajuste la répétition de la texture en fonction de la taille du bâtiment
      const material = new THREE.MeshStandardMaterial({
        map: buildingTexture.clone(), // Clone pour personnaliser la répétition par bâtiment
      });
      material.map.wrapS = THREE.RepeatWrapping;
      material.map.wrapT = THREE.RepeatWrapping;

      // Calcule la répétition en fonction de la taille du bâtiment
      material.map.repeat.set(width / 4, height / 4); // Diviser par 4 ou ajuster selon l'échelle désirée

      const building = new THREE.Mesh(buildingGeometry, material);
      building.position.set(
        Math.random() * 200 - 100,
        height / 2,
        Math.random() * 200 - 100
      );

      // Ajout de la boîte de collision
      building.geometry.computeBoundingBox();
      building.boundingBox = building.geometry.boundingBox.clone();

      scene.add(building);
    }
  }

  createBuildings();
  // #endregion Sol et bâtiments

  // Création du drone
  const droneTexture = textureLoader.load("public/drone.png");
  const droneGeometry = new THREE.BoxGeometry(1, 0.1, 1);
  const droneMaterial = new THREE.MeshStandardMaterial({
    map: droneTexture,
    transparent: true,
  });
  drone = new THREE.Mesh(droneGeometry, droneMaterial);
  drone.position.set(0, 5, 0);
  scene.add(drone);

  // Initialisation de la vitesse linéaire
  velocity = new THREE.Vector3(0, 0, 0);

  // Écoute des touches
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  animate();
}

//#region Fonctions de contrôle
// Fonction pour vérifier les collisions entre le drone et les bâtiments
function checkCollisions() {
  const droneBox = new THREE.Box3().setFromObject(drone); // Boîte de collision du drone

  // Vérifie chaque bâtiment pour détecter une collision
  scene.children.forEach((child) => {
    if (child.boundingBox) {
      // Vérifie que l'objet a une boîte de collision
      const buildingBox = child.boundingBox
        .clone()
        .applyMatrix4(child.matrixWorld); // Boîte de collision du bâtiment

      // Si collision, réinitialise la position ou applique un effet
      if (droneBox.intersectsBox(buildingBox)) {
        console.log("Collision détectée avec un bâtiment !");
        resetDronePosition();
      }
    }
  });
}

function handleKeyDown(event) {
  switch (event.key) {
    case " ":
      throttle = throttleStrength;
      break;
    case "z":
      pitch = -rotationSpeed;
      break;
    case "s":
      pitch = rotationSpeed;
      break;
    case "q":
      roll = rotationSpeed;
      break;
    case "d":
      roll = -rotationSpeed;
      break;
    case "a":
      yaw = rotationSpeed;
      break;
    case "e":
      yaw = -rotationSpeed;
      break;
    case "c":
      toggleFPV();
      break;
    case "r":
      resetDronePosition();
      break;
    case "m":
      toggleLevelMode();
      break;
  }
}

function handleKeyUp(event) {
  switch (event.key) {
    case " ":
      throttle = 0;
      break;
    case "z":
    case "s":
      pitch = 0;
      break;
    case "q":
    case "d":
      roll = 0;
      break;
    case "a":
    case "e":
      yaw = 0;
      break;
  }
}
//#endregion Fonctions de contrôle

// Fonction pour réinitialiser la position du drone
function resetDronePosition() {
  drone.position.set(0, 5, 0); // Position initiale
  velocity.set(0, 0, 0); // Réinitialise la vitesse
  drone.quaternion.set(0, 0, 0, 1); // Réinitialise la rotation
}

// Bascule entre la vue FPV et orbitale
function toggleFPV() {
  isFPV = !isFPV;
  if (isFPV) {
    controls.enabled = false;
    updateFpvCameraSettings();
    drone.add(camera);
    toggleGuiControls(true);
  } else {
    controls.enabled = true;
    drone.remove(camera);
    camera.position.set(10, 10, 10);
    controls.update();
    toggleGuiControls(false);
  }
}

// Met à jour les paramètres de la caméra FPV
function updateFpvCameraSettings() {
  camera.fov = fpvSettings.fov;
  camera.updateProjectionMatrix();
  camera.position.set(0, 0.2, -0.5);
  camera.rotation.set(fpvSettings.angle, 0, 0);
}

// Bascule entre le mode "accro" et le mode "level"
function toggleLevelMode() {
  isLevelMode = !isLevelMode;
  modeIndicator.innerText = `Mode: ${isLevelMode ? "Level" : "Accro"}`;
}

function animate() {
  requestAnimationFrame(animate);

  // Applique la gravité
  velocity.y += gravity;

  // Calcul de la direction locale en fonction de l'orientation du drone
  const thrustDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(
    drone.quaternion
  );

  // Applique la poussée dans la direction du drone
  velocity.add(thrustDirection.multiplyScalar(throttle));
  velocity.multiplyScalar(airFriction);

  // Applique le roulis, le tangage et le lacet en utilisant des axes locaux
  drone.rotateOnAxis(new THREE.Vector3(1, 0, 0), pitch);
  drone.rotateOnAxis(new THREE.Vector3(0, 0, 1), roll);
  drone.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), yaw);

  if (isLevelMode) {
    console.log("Level mode");
  }

  drone.position.add(velocity);

  // Appel de la fonction de vérification de collision
  checkCollisions();

  if (drone.position.y <= 0.05) {
    drone.position.y = 0.05;
    velocity.y = 0;
  }

  if (!isFPV) controls.update();

  renderer.render(scene, camera);
}

// aide à la gestion du redimensionnement de la fenêtre
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
