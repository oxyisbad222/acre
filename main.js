// --- Firebase Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Setup ---
const firebaseConfig = {
  apiKey: "AIzaSyBc6LPPXabs-MvfhfYzkwg93id4ffDdHfg",
  authDomain: "acre-49540.firebaseapp.com",
  projectId: "acre-49540",
  storageBucket: "acre-49540.firebasestorage.app",
  messagingSenderId: "845010622970",
  appId: "1:845010622970:web:496a3cbe8bab2a6e3e6c43",
  measurementId: "G-XJ0D283DXC"
};
const appId = 'acre-49540';
let app, auth, db, userId;

// --- Game Constants & State ---
const TILE_SIZE = 32;
const WORLD_WIDTH = 300;
const WORLD_HEIGHT = 150;
const GRAVITY = 0.6;
const PLAYER_SPEED = 4;
const JUMP_FORCE = -13;
const PLAYER_HEIGHT = TILE_SIZE * 1.8;
const PLAYER_WIDTH = TILE_SIZE * 0.9;
const FOOTSTEP_INTERVAL = 350; // ms

let gameState = {
    worldId: null,
    worldData: [],
    players: {},
    particles: [],
    isPaused: false,
    isInventoryOpen: false,
    isWorldDirty: true,
    localPlayer: {
        x: 0, y: 0, vx: 0, vy: 0, health: 10, maxHealth: 10, onGround: false, character: 'male',
        inventory: {}, hotbar: [null, null, null, null, null, null, null, null], selectedHotbarSlot: 0,
        lastFootstepTime: 0
    }
};

// --- DOM & Canvas References ---
const loadingScreen = document.getElementById('loading-screen'), loadingStatus = document.getElementById('loading-status'),
      charSelectScreen = document.getElementById('character-select-screen'), mainMenu = document.getElementById('main-menu'),
      gameContainer = document.getElementById('game-container'), canvas = document.getElementById('game-canvas'),
      ctx = canvas.getContext('2d'), worldCanvas = document.createElement('canvas'), worldCtx = worldCanvas.getContext('2d');

let worldUnsubscribe = null, playersUnsubscribe = null;
let musicElement = null;
let ambientSoundElement = null;

// --- Asset & Data Definitions ---
const assets = { images: {}, sprites: {}, sounds: {}, music: {} };
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// NOTE: Assumes .wav format and a numbered convention inside folders. Adjust paths if needed.
const SOUND_DATA = {
    footsteps: {
        grass: Array.from({length: 4}, (_, i) => `./assets/sfx/Footsteps_Grass/Footsteps_Grass_Walk/Footsteps_Grass_Walk_0${i+1}.wav`),
        dirt: Array.from({length: 4}, (_, i) => `./assets/sfx/Footsteps_DirtyGround/Footsteps_DirtyGround_Walk/Footsteps_DirtyGround_Walk_0${i+1}.wav`),
        stone: Array.from({length: 4}, (_, i) => `./assets/sfx/Footsteps_Rock/Footsteps_Rock_Walk/Footsteps_Rock_Walk_0${i+1}.wav`),
        sand: Array.from({length: 4}, (_, i) => `./assets/sfx/Footsteps_Sand/Footsteps_Sand_Walk/Footsteps_Sand_Walk_0${i+1}.wav`),
        wood: Array.from({length: 4}, (_, i) => `./assets/sfx/Footsteps_Wood/Footsteps_Wood_Walk/Footsteps_Wood_Walk_0${i+1}.wav`),
    },
    voice: {
        male: { jump: './assets/sfx/VoiceFX/Male/Male_Jump_01.wav' },
        female: { jump: './assets/sfx/VoiceFX/Female/Female_Jump_01.wav' },
        alien: { jump: './assets/sfx/VoiceFX/Male/Male_Jump_01.wav' } // Placeholder for alien
    },
    ambient: {
        rain: './assets/sfx/rain.wav',
        ocean: './assets/sfx/ocean.wav'
    }
};
const MUSIC_DATA = { 'calm': './assets/Music/calm.mp3', 'dungeon': './assets/Music/dungeon.mp3' };

const PLAYABLE_CHARACTERS = ['male', 'female', 'alien'];
const CHARACTER_DATA = {
    'male': { head: 'male_head.png', body: 'male_body.png', voice: 'male' },
    'female': { head: 'female_head.png', body: 'female_body.png', voice: 'female' },
    'alien': { head: 'alien_head.png', body: 'alien_body.png', voice: 'alien' },
    'boar': { head: 'boar_head.png', body: 'boar_body.png' },
    'gnome': { head: 'gnome_head.png', body: 'gnome_body.png' },
    'skeleton': { head: 'skeleton_head.png', body: 'skeleton_body.png' },
    'zombie': { head: 'zombie_head.png', body: 'zombie_body.png' }
};

const TILE_TYPES = {
    0: { name: 'Sky', solid: false },
    1: { name: 'Grass', sprite: 'dirt_grass.png', hardness: 1, footstepType: 'grass' },
    2: { name: 'Dirt', sprite: 'dirt.png', hardness: 1, footstepType: 'dirt' },
    3: { name: 'Stone', sprite: 'stone.png', hardness: 2, footstepType: 'stone' },
    4: { name: 'Wood', sprite: 'trunk_mid.png', solid: true, hardness: 1.5, footstepType: 'wood' },
    5: { name: 'Leaves', sprite: 'leaves.png', solid: false, hardness: 0.5, footstepType: 'grass' },
    6: { name: 'Sand', sprite: 'sand.png', hardness: 1, footstepType: 'sand' },
    7: { name: 'Cactus', sprite: 'cactus_side.png', hardness: 1, damage: 1, footstepType: 'wood' },
    8: { name: 'Coal Ore', sprite: 'stone_coal.png', hardness: 3, footstepType: 'stone' },
    9: { name: 'Iron Ore', sprite: 'stone_iron.png', hardness: 4, footstepType: 'stone' },
    10: { name: 'Crafting Bench', sprite: 'table.png', solid: true, hardness: 2, footstepType: 'wood' },
    11: { name: 'Wood Planks', sprite: 'wood.png', solid: true, hardness: 1.5, footstepType: 'wood' },
    12: { name: 'Grey Brick', sprite: 'brick_grey.png', solid: true, hardness: 2.5, footstepType: 'stone' },
    13: { name: 'Red Brick', sprite: 'brick_red.png', solid: true, hardness: 2.5, footstepType: 'stone' },
    14: { name: 'Glass', sprite: 'glass.png', solid: true, hardness: 0.5, footstepType: 'stone' },
};

const ITEM_DATA = {
    'wood': { name: 'Wood Log', tileId: 4, placeable: true, sprite: 'trunk_side.png' },
    'wood_planks': { name: 'Planks', tileId: 11, placeable: true, sprite: 'wood.png' },
    'stick': { name: 'Stick', sprite: 'arrow.png' },
    'stone': { name: 'Stone', tileId: 3, placeable: true, sprite: 'stone.png' },
    'sand': { name: 'Sand', tileId: 6, placeable: true, sprite: 'sand.png' },
    'coal': { name: 'Coal', sprite: 'ore_coal.png' },
    'iron_ore': { name: 'Iron Ore', sprite: 'ore_iron.png' },
    'iron_ingot': { name: 'Iron Ingot', sprite: 'ore_ironAlt.png' },
    'crafting_bench': { name: 'Crafting Bench', tileId: 10, placeable: true, sprite: 'table.png' },
    'glass': { name: 'Glass Pane', tileId: 14, placeable: true, sprite: 'glass.png' },
};

const CRAFTING_RECIPES = {
    'wood_planks': { requires: { 'wood': 1 }, quantity: 4 },
    'stick': { requires: { 'wood_planks': 2 }, quantity: 4 },
    'crafting_bench': { requires: { 'wood_planks': 4 }, quantity: 1 },
};

// --- Initialization & Asset Loading ---
window.onload = initializeGame;

async function initializeGame() {
    try {
        loadingStatus.textContent = 'Loading assets...';
        await initializeAssets();
        loadingStatus.textContent = 'Loading sounds...';
        await loadSounds();
        loadingStatus.textContent = 'Building textures...';
        await createParallaxTextures();
        loadingStatus.textContent = 'Connecting...';
        await initializeFirebase();
        loadingStatus.textContent = 'Ready!';
        loadingScreen.classList.add('hidden');
        showCharacterSelect();
        playMusic();
        playAmbientSound();
    } catch (error) {
        console.error("Game initialization failed:", error);
        loadingStatus.textContent = 'Error starting game.';
    }
}

async function initializeAssets() {
    const xmlUrls = {
        'characters': './assets/Spritesheets/spritesheet_characters.xml',
        'tiles': './assets/Spritesheets/spritesheet_tiles.xml',
        'items': './assets/Spritesheets/spritesheet_items.xml',
        'particles': './assets/Spritesheets/spritesheet_particles.xml',
    };
    const imageUrls = {
        'characters': './assets/Spritesheets/spritesheet_characters.png',
        'tiles': './assets/Spritesheets/spritesheet_tiles.png',
        'items': './assets/Spritesheets/spritesheet_items.png',
        'particles': './assets/Spritesheets/spritesheet_particles.png',
    }

    const promises = Object.keys(xmlUrls).map(key => loadSpriteSheetFromURL(key, xmlUrls[key], imageUrls[key]));
    await Promise.all(promises);
}

async function loadSpriteSheetFromURL(name, xmlUrl, imageUrl) {
    try {
        const response = await fetch(xmlUrl);
        if(!response.ok) throw new Error(`Failed to fetch ${xmlUrl}`);
        const xmlContent = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, "application/xml");
        const subTextures = xmlDoc.getElementsByTagName("SubTexture");
        assets.sprites[name] = {};
        for (const sub of subTextures) {
            assets.sprites[name][sub.getAttribute("name")] = { x: parseInt(sub.getAttribute("x")), y: parseInt(sub.getAttribute("y")), width: parseInt(sub.getAttribute("width")), height: parseInt(sub.getAttribute("height")) };
        }
        assets.images[name] = new Image();
        assets.images[name].src = imageUrl;
        await assets.images[name].decode();
    } catch (e) {
        console.error(`Failed to load spritesheet ${name}:`, e);
    }
}

async function loadSounds() {
    for (const type in SOUND_DATA) {
        if (type === 'footsteps' || type === 'voice') {
            for (const category in SOUND_DATA[type]) {
                for (const action in SOUND_DATA[type][category]) {
                    const soundList = SOUND_DATA[type][category][action];
                    assets.sounds[`${type}_${category}_${action}`] = [];
                    const promises = (Array.isArray(soundList) ? soundList : [soundList]).map(async (path) => {
                         try {
                            const response = await fetch(path);
                            if (!response.ok) return;
                            const arrayBuffer = await response.arrayBuffer();
                            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                            assets.sounds[`${type}_${category}_${action}`].push(audioBuffer);
                        } catch (e) { /* Fail silently */ }
                    });
                    await Promise.all(promises);
                }
            }
        }
    }
}

function playSound(soundArray) {
    if (!soundArray || soundArray.length === 0 || audioCtx.state !== 'running') return;
    const buffer = soundArray[Math.floor(Math.random() * soundArray.length)];
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
}

function playMusic() {
    const musicKeys = Object.keys(MUSIC_DATA);
    if(musicKeys.length === 0) return;
    if(!musicElement) {
        musicElement = new Audio();
        document.body.appendChild(musicElement);
        musicElement.volume = 0.3;
        musicElement.loop = true;
    }
    const randomTrackKey = musicKeys[Math.floor(Math.random() * musicKeys.length)];
    musicElement.src = MUSIC_DATA[randomTrackKey];
    musicElement.play().catch(e => {});
}

function playAmbientSound() {
    const ambientKeys = Object.keys(SOUND_DATA.ambient);
    if(ambientKeys.length === 0) return;
     if(!ambientSoundElement) {
        ambientSoundElement = new Audio();
        document.body.appendChild(ambientSoundElement);
        ambientSoundElement.volume = 0.4;
        ambientSoundElement.loop = true;
    }
    const randomTrackKey = ambientKeys[Math.floor(Math.random() * ambientKeys.length)];
    ambientSoundElement.src = SOUND_DATA.ambient[randomTrackKey];
    ambientSoundElement.play().catch(e => {});
}


async function createParallaxTextures() {
    const groundSprite = assets.sprites.tiles?.['dirt_grass.png'];
    const treeTrunkSprite = assets.sprites.tiles?.['trunk_mid.png'];
    const leavesSprite = assets.sprites.tiles?.['leaves.png'];
    const tilesSheet = assets.images.tiles;

    if (!groundSprite || !treeTrunkSprite || !leavesSprite || !tilesSheet || !tilesSheet.complete || tilesSheet.naturalHeight === 0) {
        return;
    }

    const groundCanvas = document.createElement('canvas');
    const groundCtx = groundCanvas.getContext('2d');
    groundCanvas.width = 128 * 10;
    groundCanvas.height = 128;
    for (let i = 0; i < 10; i++) {
        groundCtx.drawImage(tilesSheet, groundSprite.x, groundSprite.y, 128, 128, i * 128, 0, 128, 128);
    }
    document.getElementById('parallax-hills').style.backgroundImage = `url(${groundCanvas.toDataURL()})`;
    
    const treeCanvas = document.createElement('canvas');
    const treeCtx = treeCanvas.getContext('2d');
    treeCanvas.width = 1024;
    treeCanvas.height = 300;
    for (let i = 0; i < 5; i++) {
        const x = Math.random() * (treeCanvas.width - 128);
        const h = 3 + Math.floor(Math.random() * 3);
        const y = treeCanvas.height - (h * 32);
        for (let j = 0; j < h; j++) {
            treeCtx.drawImage(tilesSheet, treeTrunkSprite.x, treeTrunkSprite.y, 128, 128, x + 48, y + (j * 32), 32, 32);
        }
        treeCtx.drawImage(tilesSheet, leavesSprite.x, leavesSprite.y, 128, 128, x, y - 64, 128, 128);
    }
    document.getElementById('parallax-trees').style.backgroundImage = `url(${treeCanvas.toDataURL()})`;
}

async function initializeFirebase() {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    return new Promise(resolve => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                resolve();
            } else {
                await signInAnonymously(auth);
            }
        });
    });
}

// --- Player Physics & Movement ---
function updatePlayer(deltaTime) {
    const p = gameState.localPlayer;
    const now = performance.now();

    if (input.left || input.right) {
        p.vx = input.left ? -PLAYER_SPEED : PLAYER_SPEED;
        if (p.onGround && now - p.lastFootstepTime > FOOTSTEP_INTERVAL) {
            const tileX = Math.floor((p.x + PLAYER_WIDTH / 2) / TILE_SIZE);
            const tileY = Math.floor((p.y + PLAYER_HEIGHT + 1) / TILE_SIZE);
            const groundTile = TILE_TYPES[gameState.worldData[tileX]?.[tileY] ?? 0];
            const footstepType = groundTile?.footstepType || 'dirt';
            playSound(assets.sounds[`footsteps_${footstepType}_walk`]);
            p.lastFootstepTime = now;
        }
    } else {
        p.vx = 0;
    }

    p.vy += GRAVITY;
    if (p.vy > 15) p.vy = 15;

    if (input.jump && p.onGround) {
        p.vy = JUMP_FORCE;
        const voiceType = CHARACTER_DATA[p.character]?.voice || 'male';
        playSound(assets.sounds[`voice_${voiceType}_jump`]);
    }

    let newX = p.x + p.vx;
    let newY = p.y + p.vy;
    p.onGround = false;

    // Y-Axis Collision
    const vertCheck = p.vy > 0 ? newY + PLAYER_HEIGHT : newY;
    const playerVertTile = Math.floor(vertCheck / TILE_SIZE);
    for (let tx = Math.floor(p.x / TILE_SIZE); tx <= Math.floor((p.x + PLAYER_WIDTH) / TILE_SIZE); tx++) {
        if (isTileSolid(tx, playerVertTile)) {
            if (p.vy > 0) {
                newY = playerVertTile * TILE_SIZE - PLAYER_HEIGHT;
                p.onGround = true;
            } else {
                newY = (playerVertTile + 1) * TILE_SIZE;
            }
            p.vy = 0;
            break; 
        }
    }

    // X-Axis Collision
    const horizCheck = p.vx > 0 ? newX + PLAYER_WIDTH : newX;
    const playerHorizTile = Math.floor(horizCheck / TILE_SIZE);
    for (let ty = Math.floor(newY / TILE_SIZE); ty < Math.floor((newY + PLAYER_HEIGHT) / TILE_SIZE); ty++) {
        if (isTileSolid(playerHorizTile, ty)) {
            newX = p.vx > 0 ? playerHorizTile * TILE_SIZE - PLAYER_WIDTH : (playerHorizTile + 1) * TILE_SIZE;
            p.vx = 0;
            break;
        }
    }

    p.x = newX;
    p.y = newY;
    if (p.y > (WORLD_HEIGHT + 20) * TILE_SIZE) {
        respawnPlayer();
    }
}

function isTileSolid(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return true;
    const tileId = gameState.worldData[x]?.[y] ?? 0;
    const tile = TILE_TYPES[tileId];
    return tile && tile.solid !== false;
}

// --- Game Loop & Core Drawing Logic ---
let lastTime = 0;
let camera = { x: 0, y: 0 };
let input = { left: false, right: false, jump: false, action: false };

function gameLoop(timestamp) {
    if (!gameContainer.classList.contains('hidden') && !gameState.isPaused && !gameState.isInventoryOpen) {
        const deltaTime = (timestamp - lastTime) / 1000;
        lastTime = timestamp;
        update(deltaTime);
        draw();
    }
    requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
    updatePlayer(deltaTime);
    updateParticles(deltaTime);
    updateCamera();
    if (Math.random() < 0.1) {
        sendPlayerData();
    }
}

function draw() {
    ctx.fillStyle = '#78a9fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (gameState.isWorldDirty) {
        drawWorldToCache();
        gameState.isWorldDirty = false;
    }
    ctx.save();
    ctx.translate(Math.floor(-camera.x), Math.floor(-camera.y));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(worldCanvas, 0, 0);
    drawParticles();
    drawPlayers();
    ctx.restore();
}

function drawWorldToCache() {
    worldCtx.clearRect(0, 0, worldCanvas.width, worldCanvas.height);
    const tilesImage = assets.images.tiles;
    if (!tilesImage || !tilesImage.complete || tilesImage.naturalHeight === 0) return;
    worldCtx.imageSmoothingEnabled = false;
    for (let x = 0; x < WORLD_WIDTH; x++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
            const tileId = gameState.worldData[x]?.[y] ?? 0;
            const tile = TILE_TYPES[tileId];
            if (tile && tile.sprite) {
                const spriteData = assets.sprites.tiles[tile.sprite];
                if (spriteData) {
                    worldCtx.drawImage(tilesImage, spriteData.x, spriteData.y, spriteData.width, spriteData.height, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }
    }
}

function drawPlayers() {
    const charSheet = assets.images.characters;
    const spriteData = assets.sprites.characters;
    if (!charSheet || !charSheet.complete || charSheet.naturalHeight === 0) return;

    for (const pId in gameState.players) {
        const player = gameState.players[pId];
        if (!player) continue;
        const charKey = player.character && CHARACTER_DATA[player.character] ? player.character : 'male';
        const char = CHARACTER_DATA[charKey];
        if (!char) continue;

        const bodySprite = spriteData[char.body];
        const headSprite = spriteData[char.head];

        const p_x = Math.floor(player.x);
        const p_y = Math.floor(player.y);

        if (bodySprite) {
            const scale = PLAYER_HEIGHT / bodySprite.height;
            const scaledWidth = bodySprite.width * scale;
            const bodyX = p_x + (PLAYER_WIDTH - scaledWidth) / 2;
            ctx.drawImage(charSheet, bodySprite.x, bodySprite.y, bodySprite.width, bodySprite.height, bodyX, p_y, scaledWidth, PLAYER_HEIGHT);
        }
        if (headSprite) {
            const scale = (TILE_SIZE * 1.2) / headSprite.height;
            const scaledWidth = headSprite.width * scale;
            const headX = p_x + (PLAYER_WIDTH - scaledWidth) / 2;
            ctx.drawImage(charSheet, headSprite.x, headSprite.y, headSprite.width, headSprite.height, headX, p_y - TILE_SIZE + 10, scaledWidth, TILE_SIZE * 1.2);
        }

        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.font = "10px 'Press Start 2P'";
        ctx.fillText(player.name || pId.substring(0, 5), p_x + PLAYER_WIDTH / 2, p_y - 15);
    }
}


// --- Particle System ---
function spawnBlockParticles(x, y, tileId) {
    const tile = TILE_TYPES[tileId];
    if (!tile || !tile.sprite) return;
    const particleSprite = assets.sprites.tiles[tile.sprite];
    if (!particleSprite) return;
    const particleSheet = assets.images.tiles;
    if(!particleSheet) return;

    for (let i = 0; i < 10; i++) {
        gameState.particles.push({
            x: x * TILE_SIZE + TILE_SIZE / 2,
            y: y * TILE_SIZE + TILE_SIZE / 2,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5 - 3,
            life: Math.random() * 1.5 + 0.5,
            sprite: particleSprite,
            sheet: particleSheet,
            size: Math.random() * 4 + 4
        });
    }
}

function updateParticles(deltaTime) {
    for (let i = gameState.particles.length - 1; i >= 0; i--) {
        const p = gameState.particles[i];
        p.life -= deltaTime;
        if (p.life <= 0) {
            gameState.particles.splice(i, 1);
            continue;
        }
        p.vy += GRAVITY * 2;
        p.x += p.vx;
        p.y += p.vy;
    }
}

function drawParticles() {
    ctx.globalAlpha = 0.8;
    for (const p of gameState.particles) {
        if (!p.sheet || !p.sheet.complete || p.sheet.naturalHeight === 0) continue;
        ctx.drawImage(p.sheet,
            p.sprite.x + Math.random() * (p.sprite.width - 8),
            p.sprite.y + Math.random() * (p.sprite.height - 8),
            8, 8, p.x, p.y, p.size, p.size
        );
    }
    ctx.globalAlpha = 1.0;
}


// --- World Generation ---
function generateWorld() { let world = Array(WORLD_WIDTH).fill(0).map(() => Array(WORLD_HEIGHT).fill(0)); const surfaceLevel = WORLD_HEIGHT / 2.5; const desertWidth = Math.floor(WORLD_WIDTH * 0.3); const desertStart = Math.random() < 0.5 ? 0 : WORLD_WIDTH - desertWidth; for (let x = 0; x < WORLD_WIDTH; x++) { const isDesert = x >= desertStart && x < desertStart + desertWidth; const groundLevel = surfaceLevel + Math.sin(x / 20) * 5; for (let y = 0; y < WORLD_HEIGHT; y++) { if (y > groundLevel) { if (y > groundLevel + 40) { if (Math.random() < 0.05) world[x][y] = 9; /* Iron */ else if (Math.random() < 0.08) world[x][y] = 8; /* Coal */ else world[x][y] = 3; /* Stone */ } else if (y > groundLevel + 1) { world[x][y] = isDesert ? 6 : 2; /* Dirt/Sand */ } } else if (y >= Math.floor(groundLevel)) { world[x][y] = isDesert ? 6 : 1; /* Grass/Sand surface */ } } if (!isDesert && x > 5 && x < WORLD_WIDTH - 5 && Math.random() < 0.1) generateTree(world, x, Math.floor(groundLevel) - 1); if (isDesert && x > desertStart + 2 && x < desertStart + desertWidth - 2 && Math.random() < 0.05) generateCactus(world, x, Math.floor(groundLevel) - 1); } return world; }
function generateTree(world, x, y) { const height = Math.floor(Math.random() * 3) + 4; for (let i = 0; i < height; i++) if (y - i >= 0 && world[x]) world[x][y - i] = 4; const topY = y - height; for (let lx = -2; lx <= 2; lx++) for (let ly = -2; ly <= 0; ly++) if (Math.abs(lx) !== 2 || Math.abs(ly) !== 2) if (world[x + lx] && world[x + lx][topY + ly] === 0) world[x + lx][topY + ly] = 5; }
function generateCactus(world, x, y) { const height = Math.floor(Math.random() * 2) + 2; for (let i = 0; i < height; i++) if (y - i >= 0 && world[x]) world[x][y - i] = 7; }

// --- UI, Camera, and Player State ---
function updateCamera() { camera.x = gameState.localPlayer.x - canvas.width / 2 + PLAYER_WIDTH / 2; camera.y = gameState.localPlayer.y - canvas.height / 2 + PLAYER_HEIGHT / 2; camera.x = Math.max(0, Math.min(camera.x, WORLD_WIDTH * TILE_SIZE - canvas.width)); camera.y = Math.max(0, Math.min(camera.y, WORLD_HEIGHT * TILE_SIZE - canvas.height)); }
function respawnPlayer() { const player = gameState.localPlayer; player.x = (WORLD_WIDTH / 2) * TILE_SIZE; player.y = (WORLD_HEIGHT / 2.5 - 10) * TILE_SIZE; player.vx = 0; player.vy = 0; player.health = player.maxHealth; updateHUD(); }

// --- Hosting & Multiplayer ---
async function hostNewWorld() {
    const hostBtn = document.getElementById('host-btn');
    hostBtn.disabled = true;
    hostBtn.textContent = "GENERATING...";
    try {
        await new Promise(resolve => setTimeout(resolve, 50));
        const worldCode = generateWorldCode();
        gameState.worldId = worldCode;
        gameState.worldData = generateWorld();
        respawnPlayer();
        
        const playerData = { ...gameState.localPlayer, name: `Player_${userId.substring(0, 4)}`, worldId: worldCode };
        
        const worldDataForFirestore = {};
        gameState.worldData.forEach((column, x) => {
            const colData = {};
            column.forEach((tile, y) => {
                if (tile !== 0) colData[y] = tile;
            });
            if(Object.keys(colData).length > 0) worldDataForFirestore[x] = colData;
        });

        const worldRef = doc(db, `worlds`, worldCode);
        hostBtn.textContent = "UPLOADING...";
        await setDoc(worldRef, { createdAt: new Date().toISOString(), worldData: worldDataForFirestore });
        
        const playerRef = doc(db, `worlds/${worldCode}/players`, userId);
        await setDoc(playerRef, playerData);
        startGame(worldCode);

    } catch (error) {
        console.error("Error hosting world:", error);
        alert(`Could not create world. Firebase Error: ${error.message}`);
    } finally {
        hostBtn.disabled = false;
        hostBtn.textContent = "Host New World";
    }
}

async function joinWorld(worldCode) {
    const joinBtn = document.getElementById('join-confirm-btn');
    joinBtn.disabled = true;
    joinBtn.textContent = "JOINING...";
    if (!worldCode || worldCode.length !== 6) {
        alert("Invalid World Code.");
        joinBtn.disabled = false;
        joinBtn.textContent = "Join";
        return;
    }
    gameState.worldId = worldCode.toUpperCase();
    const worldRef = doc(db, `worlds`, gameState.worldId);
    try {
        const worldSnap = await getDoc(worldRef);
        if (!worldSnap.exists()) {
            alert("World not found.");
            return;
        }
        respawnPlayer();
        const playerData = { ...gameState.localPlayer, name: `Player_${userId.substring(0, 4)}`, worldId: gameState.worldId };
        const playerRef = doc(db, `worlds/${gameState.worldId}/players`, userId);
        await setDoc(playerRef, playerData);
        document.getElementById('join-world-modal').classList.add('hidden');
        startGame(gameState.worldId);
    } catch (error) {
        console.error("Error joining world:", error);
        alert("Could not join world.");
    } finally {
        joinBtn.disabled = false;
        joinBtn.textContent = "Join";
    }
}

async function sendPlayerData() {
    if (!gameState.worldId || !userId) return;
    const playerRef = doc(db, `worlds/${gameState.worldId}/players`, userId);
    try {
        const dataToUpdate = {
            x: gameState.localPlayer.x,
            y: gameState.localPlayer.y,
            health: gameState.localPlayer.health,
            character: gameState.localPlayer.character,
            inventory: gameState.localPlayer.inventory,
            hotbar: gameState.localPlayer.hotbar,
            selectedHotbarSlot: gameState.localPlayer.selectedHotbarSlot
        };
        await updateDoc(playerRef, dataToUpdate);
    } catch (e) { /* silent fail is ok for transient updates */ }
}

async function exitToMenu() {
    if (worldUnsubscribe) worldUnsubscribe();
    if (playersUnsubscribe) playersUnsubscribe();
    worldUnsubscribe = playersUnsubscribe = null;
    if (gameState.worldId && userId) {
        const playerRef = doc(db, `worlds/${gameState.worldId}/players`, userId);
        await deleteDoc(playerRef).catch(e => console.error("Could not delete player doc", e));
    }
    gameState.worldId = null;
    gameState.isPaused = false;
    gameState.isInventoryOpen = false;
    gameContainer.classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('inventory-screen').classList.add('hidden');
    mainMenu.classList.add('hidden');
    showCharacterSelect();
    if(musicElement) musicElement.pause();
    if(ambientSoundElement) ambientSoundElement.pause();
}

function generateWorldCode() {
    const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
    return Array.from({ length: 6 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

function startGame(worldId) {
    mainMenu.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    worldCanvas.width = WORLD_WIDTH * TILE_SIZE;
    worldCanvas.height = WORLD_HEIGHT * TILE_SIZE;
    gameState.isWorldDirty = true;
    
    const worldRef = doc(db, `worlds`, worldId);
    const playersCol = collection(db, `worlds/${worldId}/players`);

    worldUnsubscribe = onSnapshot(worldRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const newWorldData = Array(WORLD_WIDTH).fill(0).map(() => Array(WORLD_HEIGHT).fill(0));
            if (data.worldData) {
                for(const x in data.worldData) {
                    for(const y in data.worldData[x]) {
                        if(newWorldData[parseInt(x)]) {
                           newWorldData[parseInt(x)][parseInt(y)] = data.worldData[x][y];
                        }
                    }
                }
            }
            if (JSON.stringify(gameState.worldData) !== JSON.stringify(newWorldData)) {
                gameState.worldData = newWorldData;
                gameState.isWorldDirty = true;
            }
        } else {
            exitToMenu();
            alert("The world has been closed.");
        }
    });

    playersUnsubscribe = onSnapshot(playersCol, (snapshot) => {
        const newPlayers = {};
        snapshot.forEach(doc => {
            newPlayers[doc.id] = doc.data();
        });
        gameState.players = newPlayers;
        if (newPlayers[userId]) {
            const { x, y, vx, vy, onGround, ...serverState } = newPlayers[userId];
            Object.assign(gameState.localPlayer, serverState);
        }
        updateHUD();
    });

    resizeCanvas();
    setupControls();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
    if(musicElement && musicElement.paused) playMusic();
    if(ambientSoundElement && ambientSoundElement.paused) playAmbientSound();
}

// --- Inventory & Crafting ---
function getDropFromTile(tileId) {
    switch (tileId) {
        case 1: case 2: return 'stone';
        case 3: return 'stone';
        case 4: return 'wood';
        case 6: return 'sand';
        case 7: return null;
        case 8: return 'coal';
        case 9: return 'iron_ore';
        case 10: return 'crafting_bench';
        case 11: return 'wood_planks';
        case 14: return 'glass';
        default: return null;
    }
}

function addToInventory(itemType, count) {
    if (!itemType) return;
    const p = gameState.localPlayer;
    p.inventory[itemType] = (p.inventory[itemType] || 0) + count;
    updateHotbarFromInventory();
    updateInventoryScreen();
}

function removeFromInventory(itemType, count) {
    const p = gameState.localPlayer;
    if (p.inventory[itemType] && p.inventory[itemType] >= count) {
        p.inventory[itemType] -= count;
        if (p.inventory[itemType] <= 0) {
            delete p.inventory[itemType];
        }
        updateHotbarFromInventory();
        updateInventoryScreen();
        return true;
    }
    return false;
}

function updateHotbarFromInventory() {
    const p = gameState.localPlayer;
    const placeableItems = Object.keys(p.inventory).filter(type => ITEM_DATA[type]?.placeable);
    
    p.hotbar.fill(null);

    for (let i = 0; i < p.hotbar.length; i++) {
        const itemType = placeableItems[i];
        if (itemType) {
            p.hotbar[i] = { type: itemType, count: p.inventory[itemType] };
        }
    }
    updateHUD();
}

function craftItem(itemType, recipe) {
    if (!checkCanCraft(recipe)) return;
    for (const [item, count] of Object.entries(recipe.requires)) {
        removeFromInventory(item, count);
    }
    addToInventory(itemType, recipe.quantity);
}

function checkCanCraft(recipe) {
    for (const [item, count] of Object.entries(recipe.requires)) {
        if (!gameState.localPlayer.inventory[item] || gameState.localPlayer.inventory[item] < count) {
            return false;
        }
    }
    return true;
}

// --- UI Management ---
function showCharacterSelect() {
    const charGrid = document.getElementById('character-grid');
    charGrid.innerHTML = '';
    const charSheet = assets.images.characters;

    PLAYABLE_CHARACTERS.forEach(charKey => {
        const char = CHARACTER_DATA[charKey];
        const option = document.createElement('div');
        option.className = 'character-option';
        option.dataset.charKey = charKey;
        
        const headSprite = assets.sprites.characters?.[char.head];
        const bodySprite = assets.sprites.characters?.[char.body];

        if (headSprite && bodySprite && charSheet?.complete) {
            option.innerHTML = `
                <div class="character-preview">
                    <img src="${charSheet.src}" style="object-position: -${bodySprite.x}px -${bodySprite.y}px; width: ${charSheet.width}px; height: ${charSheet.height}px; transform: translate(25px, 20px) scale(2);">
                    <img src="${charSheet.src}" style="object-position: -${headSprite.x}px -${headSprite.y}px; width: ${charSheet.width}px; height: ${charSheet.height}px; transform: translate(20px, 0px) scale(1.8);">
                </div>
                <p class="mt-4 uppercase">${charKey}</p>`;
        } else {
             option.innerHTML = `<div class="character-preview flex items-center justify-center"><p>${charKey}</p></div>`;
        }
        
        option.onclick = () => selectCharacter(charKey, option);
        charGrid.appendChild(option);
    });

    const initialChar = gameState.localPlayer.character;
    const initialElement = charGrid.querySelector(`[data-char-key="${initialChar}"]`);
    if (initialElement) {
        initialElement.classList.add('selected');
    } else {
        charGrid.firstChild?.classList.add('selected');
        gameState.localPlayer.character = charGrid.firstChild?.dataset.charKey || 'male';
    }
    
    charSelectScreen.classList.remove('hidden');
    mainMenu.classList.add('hidden');
}

function selectCharacter(charKey, selectedElement) {
    gameState.localPlayer.character = charKey;
    document.querySelectorAll('.character-option').forEach(opt => opt.classList.remove('selected'));
    selectedElement.classList.add('selected');
}

function updateHUD() {
    const healthBar = document.getElementById('health-bar');
    healthBar.innerHTML = '';
    for (let i = 0; i < gameState.localPlayer.maxHealth; i++) {
        const heart = document.createElement('span');
        heart.textContent = i < gameState.localPlayer.health ? '♥' : '♡';
        heart.className = i < gameState.localPlayer.health ? 'text-red-500' : 'text-gray-500';
        healthBar.appendChild(heart);
    }

    const hotbarEl = document.getElementById('hotbar');
    hotbarEl.innerHTML = '';
    gameState.localPlayer.hotbar.forEach((item, index) => {
        const slot = document.createElement('div');
        slot.className = 'hotbar-slot';
        if (index === gameState.localPlayer.selectedHotbarSlot) {
            slot.classList.add('selected');
        }
        if (item) {
            const itemData = ITEM_DATA[item.type];
            const itemImage = assets.images.items;
            if (itemImage && itemData && assets.sprites.items[itemData.sprite]) {
                const spriteData = assets.sprites.items[itemData.sprite];
                const img = document.createElement('img');
                img.className = 'hotbar-item-image';
                img.style.objectFit = 'none';
                img.style.width = `${spriteData.width}px`;
                img.style.height = `${spriteData.height}px`;
                img.style.objectPosition = `-${spriteData.x}px -${spriteData.y}px`;
                img.style.transform = 'scale(0.5)';
                img.style.transformOrigin = 'center';
                img.src = itemImage.src;
                slot.appendChild(img);
            }
            const countEl = document.createElement('span');
            countEl.className = 'item-count';
            countEl.textContent = item.count;
            slot.appendChild(countEl);
        }
        slot.onclick = () => {
            gameState.localPlayer.selectedHotbarSlot = index;
            updateHUD();
        };
        hotbarEl.appendChild(slot);
    });
}

function togglePause() {
    gameState.isPaused = !gameState.isPaused;
    const pauseMenu = document.getElementById('pause-menu');
    if (gameState.isPaused) {
        document.getElementById('pause-world-code').textContent = gameState.worldId;
        pauseMenu.classList.remove('hidden');
        if(musicElement) musicElement.volume = 0.1;
        if(ambientSoundElement) ambientSoundElement.volume = 0.1;
    } else {
        pauseMenu.classList.add('hidden');
        lastTime = performance.now();
        if(musicElement) musicElement.volume = 0.3;
        if(ambientSoundElement) ambientSoundElement.volume = 0.4;
    }
}

function toggleInventory() {
    gameState.isInventoryOpen = !gameState.isInventoryOpen;
    const invScreen = document.getElementById('inventory-screen');
    if (gameState.isInventoryOpen) {
        updateInventoryScreen();
        invScreen.classList.remove('hidden');
    } else {
        invScreen.classList.add('hidden');
        lastTime = performance.now();
    }
}

function updateInventoryScreen() {
    if (!gameState.isInventoryOpen) return;
    const invGrid = document.getElementById('inventory-grid');
    invGrid.innerHTML = '';
    const slotsCount = 40;
    const invItems = Object.entries(gameState.localPlayer.inventory);

    for (let i = 0; i < slotsCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'hotbar-slot';
        const itemEntry = invItems[i];
        if (itemEntry) {
            const [itemType, count] = itemEntry;
            const itemData = ITEM_DATA[itemType];
            const itemImage = assets.images.items;
            if (itemImage && itemData && assets.sprites.items[itemData.sprite]) {
                const spriteData = assets.sprites.items[itemData.sprite];
                const img = document.createElement('img');
                img.className = 'hotbar-item-image';
                img.style.transform = 'scale(0.75)';
                img.src = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVHja7cEBAQAAAIIg/69uSEABAAAAAAAAAAAAAAB0BwGAAAEW4gC2AAAAAElFTkSuQmCC`; // transparent pixel
                img.style.backgroundImage = `url(${itemImage.src})`;
                img.style.backgroundPosition = `-${spriteData.x*0.75}px -${spriteData.y*0.75}px`;
                img.style.backgroundRepeat = 'no-repeat';

                slot.appendChild(img);
            }
            const countEl = document.createElement('span');
            countEl.className = 'item-count';
            countEl.textContent = count;
            slot.appendChild(countEl);
        }
        invGrid.appendChild(slot);
    }
    updateCraftingList();
}

function updateCraftingList() {
    const recipesEl = document.getElementById('crafting-recipes');
    recipesEl.innerHTML = '';
    for (const [itemType, recipeData] of Object.entries(CRAFTING_RECIPES)) {
        const canCraft = checkCanCraft(recipeData);
        const recipeEl = document.createElement('div');
        recipeEl.className = 'recipe';
        if (canCraft) recipeEl.classList.add('can-craft');
        
        const resultItemData = ITEM_DATA[itemType];
        let reqText = Object.entries(recipeData.requires).map(([reqItem, reqCount]) => `${reqCount} ${ITEM_DATA[reqItem]?.name || reqItem}`).join(', ');

        recipeEl.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="w-10 h-10 bg-gray-700 flex items-center justify-center pixel-art" id="recipe-img-${itemType}"></div>
                <div>
                    <span>${resultItemData.name} x${recipeData.quantity}</span>
                    <br>
                    <small class="text-gray-400">${reqText}</small>
                </div>
            </div>`;
        
        if (canCraft) {
            recipeEl.onclick = () => craftItem(itemType, recipeData);
        }
        recipesEl.appendChild(recipeEl);

        const itemImage = assets.images.items;
        if (itemImage && resultItemData && assets.sprites.items[resultItemData.sprite]) {
            const resultSprite = assets.sprites.items[resultItemData.sprite];
            const imgContainer = document.getElementById(`recipe-img-${itemType}`);
            const img = document.createElement('img');
            img.style.objectFit = 'none';
            img.style.width = `${resultSprite.width}px`;
            img.style.height = `${resultSprite.height}px`;
            img.style.objectPosition = `-${resultSprite.x}px -${resultSprite.y}px`;
            img.src = itemImage.src;
            img.style.transform = 'scale(0.4)';
            img.style.transformOrigin = 'center';
            imgContainer.appendChild(img);
        }
    }
}

// --- Controls & Event Listeners ---
function setupControls() {
    window.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT') return;
        if (e.key === 'Escape') {
            if (gameState.isInventoryOpen) toggleInventory();
            else if (!gameContainer.classList.contains('hidden')) togglePause();
            return;
        }
        if (e.key.toLowerCase() === 'e' && !gameState.isPaused) {
            toggleInventory();
            return;
        }
        if (gameState.isInventoryOpen || gameState.isPaused) return;

        switch (e.key.toLowerCase()) {
            case 'a': case 'arrowleft': input.left = true; break;
            case 'd': case 'arrowright': input.right = true; break;
            case ' ': case 'w': case 'arrowup': input.jump = true; break;
        }
    });

    window.addEventListener('keyup', (e) => {
        switch (e.key.toLowerCase()) {
            case 'a': case 'arrowleft': input.left = false; break;
            case 'd': case 'arrowright': input.right = false; break;
            case ' ': case 'w': case 'arrowup': input.jump = false; break;
        }
    });

    canvas.addEventListener('mousedown', (e) => handleAction(e));

    if ('ontouchstart' in window) {
        document.getElementById('mobile-controls').classList.remove('hidden');
        const dpadLeft = document.getElementById('d-pad-left'), dpadRight = document.getElementById('d-pad-right'),
              jumpBtn = document.getElementById('jump-button'), actionBtn = document.getElementById('action-button');
        
        dpadLeft.addEventListener('touchstart', (e) => { e.preventDefault(); input.left = true; });
        dpadLeft.addEventListener('touchend', (e) => { e.preventDefault(); input.left = false; });
        dpadRight.addEventListener('touchstart', (e) => { e.preventDefault(); input.right = true; });
        dpadRight.addEventListener('touchend', (e) => { e.preventDefault(); input.right = false; });
        jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); input.jump = true; });
        jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); input.jump = false; });
        actionBtn.addEventListener('touchstart', (e) => { e.preventDefault(); handleAction(e); });
    }

    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gameState.isWorldDirty = true;
}

function handleAction(event) {
    if (gameState.isPaused || gameState.isInventoryOpen) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = (event.clientX || event.touches[0].clientX) - rect.left;
    const clickY = (event.clientY || event.touches[0].clientY) - rect.top;
    const worldX = clickX + camera.x;
    const worldY = clickY + camera.y;
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
    
    const selectedHotbarItem = gameState.localPlayer.hotbar[gameState.localPlayer.selectedHotbarSlot];
    if (selectedHotbarItem) {
        const itemInfo = ITEM_DATA[selectedHotbarItem.type];
        if (itemInfo && itemInfo.placeable) {
            placeBlock(tileX, tileY, itemInfo.tileId, selectedHotbarItem.type);
            return;
        }
    }
    
    breakBlock(tileX, tileY);
}

async function breakBlock(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;
    const originalTileId = gameState.worldData[x]?.[y];
    if (!originalTileId || originalTileId === 0) return;
    
    spawnBlockParticles(x, y, originalTileId);
    
    const blockToDrop = getDropFromTile(originalTileId);
    if (blockToDrop) {
        addToInventory(blockToDrop, 1);
    }
    
    gameState.worldData[x][y] = 0;
    gameState.isWorldDirty = true;

    if (gameState.worldId) {
        const worldRef = doc(db, `worlds`, gameState.worldId);
        await updateDoc(worldRef, { [`worldData.${x}.${y}`]: 0 });
    }
}

async function placeBlock(x, y, tileId, itemType) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;
    if (gameState.worldData[x]?.[y] !== 0) return;

    if (!removeFromInventory(itemType, 1)) return;
    
    gameState.worldData[x][y] = tileId;
    gameState.isWorldDirty = true;
    
    if (gameState.worldId) {
        const worldRef = doc(db, `worlds`, gameState.worldId);
        await updateDoc(worldRef, { [`worldData.${x}.${y}`]: tileId });
    }
}

// --- Main Menu & UI Listeners ---
document.getElementById('start-game-btn').addEventListener('click', () => {
    charSelectScreen.classList.add('hidden');
    mainMenu.classList.remove('hidden');
});
document.getElementById('host-btn').addEventListener('click', hostNewWorld);
document.getElementById('join-btn').addEventListener('click', () => { document.getElementById('join-world-modal').classList.remove('hidden'); });
document.getElementById('join-cancel-btn').addEventListener('click', () => { document.getElementById('join-world-modal').classList.add('hidden'); });
document.getElementById('join-confirm-btn').addEventListener('click', () => {
    const code = document.getElementById('world-code-input').value;
    joinWorld(code);
});
document.getElementById('pause-btn').addEventListener('click', togglePause);
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('exit-btn').addEventListener('click', exitToMenu);
document.getElementById('inventory-btn').addEventListener('click', toggleInventory);
document.getElementById('close-inventory-btn').addEventListener('click', toggleInventory);

const parallaxHills = document.getElementById('parallax-hills');
const parallaxTrees = document.getElementById('parallax-trees');
mainMenu.addEventListener('mousemove', (e) => {
    if(mainMenu.classList.contains('hidden')) return;
    const x = e.clientX / window.innerWidth - 0.5;
    parallaxHills.style.backgroundPositionX = -x * 30 + 'px';
    parallaxTrees.style.backgroundPositionX = -x * 60 + 'px';
});

document.body.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if (musicElement && musicElement.paused) {
        playMusic();
    }
    if (ambientSoundElement && ambientSoundElement.paused) {
        playAmbientSound();
    }
}, { once: true });
