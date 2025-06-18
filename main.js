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
    }
};

// --- DOM & Canvas References ---
const loadingScreen = document.getElementById('loading-screen'), loadingStatus = document.getElementById('loading-status'),
      charSelectScreen = document.getElementById('character-select-screen'), mainMenu = document.getElementById('main-menu'),
      gameContainer = document.getElementById('game-container'), canvas = document.getElementById('game-canvas'),
      ctx = canvas.getContext('2d'), worldCanvas = document.createElement('canvas'), worldCtx = worldCanvas.getContext('2d');

let worldUnsubscribe = null, playersUnsubscribe = null;

// --- Asset & Data Definitions ---
const assets = { images: {}, sprites: {}, sounds: {} };
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const SOUND_DATA = { 'ui_click': '', 'break_stone': '', 'break_wood': '', 'break_dirt': '', 'player_jump': '', 'craft_item': '' };

const CHARACTER_DATA = {
    'male': { head: 'male_head.png', body: 'male_body.png' },
    'female': { head: 'female_head.png', body: 'female_body.png' }
};

const TILE_TYPES = {
    0: { name: 'Sky', solid: false }, 1: { name: 'Grass', sprite: 'dirt_grass.png', hardness: 1, sound: 'break_dirt' },
    2: { name: 'Dirt', sprite: 'dirt.png', hardness: 1, sound: 'break_dirt' }, 3: { name: 'Stone', sprite: 'stone.png', hardness: 2, sound: 'break_stone' },
    4: { name: 'Wood', sprite: 'trunk_mid.png', solid: true, hardness: 1.5, sound: 'break_wood' }, 5: { name: 'Leaves', sprite: 'leaves.png', solid: false, hardness: 0.5, sound: 'break_dirt' },
    6: { name: 'Sand', sprite: 'sand.png', hardness: 1, sound: 'break_dirt' }, 7: { name: 'Cactus', sprite: 'cactus_side.png', hardness: 1, damage: 1, sound: 'break_wood' },
    8: { name: 'Coal Ore', sprite: 'stone_coal.png', hardness: 3, sound: 'break_stone' }, 9: { name: 'Iron Ore', sprite: 'stone_iron.png', hardness: 4, sound: 'break_stone' },
    10: { name: 'Crafting Bench', sprite: 'table.png', solid: true, hardness: 2, sound: 'break_wood' }, 11: { name: 'Wood Planks', sprite: 'wood.png', solid: true, hardness: 1.5, sound: 'break_wood' },
};
const ITEM_DATA = { 'wood_planks': { name: 'Planks', tileId: 11, placeable: true, sprite: 'wood.png' },'stone': { name: 'Stone', tileId: 3, placeable: true, sprite: 'stone.png' },'sand': { name: 'Sand', tileId: 6, placeable: true, sprite: 'sand.png' },'wood': { name: 'Wood Log', tileId: 4, placeable: true, sprite: 'trunk_side.png' },'coal': { name: 'Coal', sprite: 'ore_coal.png'},'iron_ore': { name: 'Iron Ore', sprite: 'ore_iron.png' },'stick': { name: 'Stick', sprite: 'arrow.png'},'pickaxe_wood': { name: 'Wooden Pickaxe', tool: 'pickaxe', power: 1.5, sprite: 'pick_iron.png' },'pickaxe_stone': { name: 'Stone Pickaxe', tool: 'pickaxe', power: 2.5, sprite: 'pick_bronze.png' },'axe_wood': { name: 'Wooden Axe', tool: 'axe', power: 1.5, sprite: 'axe_iron.png' },'axe_stone': { name: 'Stone Axe', tool: 'axe', power: 2.5, sprite: 'axe_bronze.png' },'sword_stone': { name: 'Stone Sword', tool: 'weapon', power: 2, sprite: 'sword_iron.png' },'crafting_bench': { name: 'Crafting Bench', tileId: 10, placeable: true, sprite: 'table.png' }, };
const CRAFTING_RECIPES = { 'wood_planks': { requires: { 'wood': 1 }, quantity: 4 }, 'stick': { requires: { 'wood_planks': 2 }, quantity: 4 }, 'crafting_bench': { requires: { 'wood_planks': 4 }, quantity: 1 }, 'pickaxe_wood': { requires: { 'wood_planks': 3, 'stick': 2 }, quantity: 1, bench: true }, 'axe_wood': { requires: { 'wood_planks': 3, 'stick': 2 }, quantity: 1, bench: true }, 'pickaxe_stone': { requires: { 'stone': 3, 'stick': 2 }, quantity: 1, bench: true }, 'axe_stone': { requires: { 'stone': 3, 'stick': 2 }, quantity: 1, bench: true }, 'sword_stone': { requires: { 'stone': 2, 'stick': 1 }, quantity: 1, bench: true }, };

// --- Initialization & Asset Loading ---
window.onload = initializeGame;

async function initializeGame() {
    try {
        loadingStatus.textContent = 'Loading assets...';
        await initializeAssets();
        loadingStatus.textContent = 'Building textures...';
        await createParallaxTextures();
        loadingStatus.textContent = 'Connecting...';
        await initializeFirebase();
        loadingStatus.textContent = 'Ready!';
        loadingScreen.classList.add('hidden');
        showCharacterSelect();
    } catch (error) {
        console.error("Game initialization failed:", error);
        loadingStatus.textContent = 'Error starting game.';
    }
}

async function initializeAssets() {
    const charactersXML = `<TextureAtlas imagePath="spritesheet_characters.png"><SubTexture name="female_body.png" x="210" y="241" width="44" height="59"/><SubTexture name="female_head.png" x="0" y="222" width="78" height="72"/><SubTexture name="male_body.png" x="210" y="182" width="44" height="59"/><SubTexture name="male_head.png" x="86" y="146" width="64" height="64"/></TextureAtlas>`;
    const tilesXML = `<TextureAtlas imagePath="spritesheet_tiles.png"><SubTexture name="dirt.png" x="896" y="640" width="128" height="128"/><SubTexture name="dirt_grass.png" x="896" y="512" width="128" height="128"/><SubTexture name="stone.png" x="384" y="512" width="128" height="128"/><SubTexture name="leaves.png" x="640" y="128" width="128" height="128"/><SubTexture name="trunk_mid.png" x="128" y="128" width="128" height="128"/><SubTexture name="sand.png" x="384" y="768" width="128" height="128"/><SubTexture name="cactus_side.png" x="1024" y="128" width="128" height="128"/><SubTexture name="stone_coal.png" x="384" y="128" width="128" height="128"/><SubTexture name="stone_iron.png" x="256" y="384" width="128" height="128"/><SubTexture name="table.png" x="128" y="896" width="128" height="128"/><SubTexture name="wood.png" x="0" y="128" width="128" height="128"/></TextureAtlas>`;
    const itemsXML = `<TextureAtlas imagePath="spritesheet_items.png"><SubTexture name="wood.png" x="0" y="128" width="128" height="128"/><SubTexture name="stone.png" x="384" y="512" width="128" height="128"/><SubTexture name="sand.png" x="384" y="768" width="128" height="128"/><SubTexture name="trunk_side.png" x="128" y="0" width="128" height="128"/><SubTexture name="ore_coal.png" x="384" y="128" width="128" height="128"/><SubTexture name="ore_iron.png" x="256" y="640" width="128" height="128"/><SubTexture name="arrow.png" x="768" y="768" width="128" height="128"/><SubTexture name="pick_iron.png" x="128" y="768" width="128" height="128"/><SubTexture name="pick_bronze.png" x="256" y="128" width="128" height="128"/><SubTexture name="axe_iron.png" x="768" y="256" width="128" height="128"/><SubTexture name="axe_bronze.png" x="768" y="640" width="128" height="128"/><SubTexture name="sword_iron.png" x="0" y="256" width="128" height="128"/><SubTexture name="table.png" x="128" y="896" width="128" height="128"/></TextureAtlas>`;
    
    await Promise.all([
        loadSpriteSheet('characters', charactersXML, './assets/Spritesheets/spritesheet_characters.png'),
        loadSpriteSheet('tiles', tilesXML, './assets/Spritesheets/spritesheet_tiles.png'),
        loadSpriteSheet('items', itemsXML, './assets/Spritesheets/spritesheet_items.png')
    ]);
}

async function loadSpriteSheet(name, xmlContent, imageUrl) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "application/xml");
    const subTextures = xmlDoc.getElementsByTagName("SubTexture");
    assets.sprites[name] = {};
    for (const sub of subTextures) {
        assets.sprites[name][sub.getAttribute("name")] = { x: parseInt(sub.getAttribute("x")), y: parseInt(sub.getAttribute("y")), width: parseInt(sub.getAttribute("width")), height: parseInt(sub.getAttribute("height")) };
    }
    assets.images[name] = new Image();
    try {
        assets.images[name].src = imageUrl;
        await assets.images[name].decode();
    } catch (e) {
        console.error(`Failed to load image: ${imageUrl}. Ensure the file path is correct.`);
    }
}

async function createParallaxTextures() {
    const groundSprite = assets.sprites.tiles['dirt_grass.png'];
    const treeTrunkSprite = assets.sprites.tiles['trunk_mid.png'];
    const leavesSprite = assets.sprites.tiles['leaves.png'];
    const tilesSheet = assets.images.tiles;

    if (!groundSprite || !treeTrunkSprite || !leavesSprite || !tilesSheet || !tilesSheet.complete || tilesSheet.naturalHeight === 0) {
        console.error("Parallax textures could not be created because base assets are missing.");
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
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
        } else {
            await signInAnonymously(auth);
        }
    });
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
    } else {
        await signInAnonymously(auth);
    }
}

// --- Player Physics & Movement (FIXED) ---
function updatePlayer(deltaTime) {
    const p = gameState.localPlayer;
    if (input.left) {
        p.vx = -PLAYER_SPEED;
    } else if (input.right) {
        p.vx = PLAYER_SPEED;
    } else {
        p.vx = 0;
    }

    p.vy += GRAVITY;
    if (p.vy > 15) p.vy = 15;

    if (input.jump && p.onGround) {
        p.vy = JUMP_FORCE;
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
    const tile = TILE_TYPES[gameState.worldData[x]?.[y] ?? 0];
    return tile && tile.solid !== false;
}
// --- Game Loop & Core Drawing Logic ---
let lastTime = 0;
let camera = { x: 0, y: 0 };
let input = { left: false, right: false, jump: false };

function gameLoop(timestamp) {
    if (gameState.isPaused || gameState.isInventoryOpen) {
        requestAnimationFrame(gameLoop);
        return;
    }
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    update(deltaTime);
    draw();
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
        const charKey = player.character || 'male';
        const char = CHARACTER_DATA[charKey];
        if (!char) continue;
        const body = spriteData[char.body];
        const head = spriteData[char.head];

        const p_x = Math.floor(player.x);
        const p_y = Math.floor(player.y);

        if (body) ctx.drawImage(charSheet, body.x, body.y, body.width, body.height, p_x - (PLAYER_WIDTH * 0.1), p_y, PLAYER_WIDTH * 1.2, PLAYER_HEIGHT);
        if (head) ctx.drawImage(charSheet, head.x, head.y, head.width, head.height, p_x - 5, p_y - TILE_SIZE + 10, TILE_SIZE * 1.2, TILE_SIZE * 1.2);

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
    for (let i = 0; i < 10; i++) {
        gameState.particles.push({
            x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2,
            vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5 - 3,
            life: Math.random() * 1.5 + 0.5, sprite: particleSprite, size: Math.random() * 4 + 4
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
    const tilesImage = assets.images.tiles;
    if (!tilesImage || !tilesImage.complete || tilesImage.naturalHeight === 0) return;
    ctx.globalAlpha = 0.8;
    for (const p of gameState.particles) {
        ctx.drawImage(tilesImage,
            p.sprite.x + Math.random() * (p.sprite.width - 8),
            p.sprite.y + Math.random() * (p.sprite.height - 8),
            8, 8, p.x, p.y, p.size, p.size
        );
    }
    ctx.globalAlpha = 1.0;
}


// --- World Generation ---
function generateWorld() { let world = Array(WORLD_WIDTH).fill(0).map(() => Array(WORLD_HEIGHT).fill(0)); const surfaceLevel = WORLD_HEIGHT / 2.5; const desertWidth = Math.floor(WORLD_WIDTH * 0.3); const desertStart = Math.random() < 0.5 ? 0 : WORLD_WIDTH - desertWidth; for (let x = 0; x < WORLD_WIDTH; x++) { const isDesert = x >= desertStart && x < desertStart + desertWidth; const groundLevel = surfaceLevel + Math.sin(x / 20) * 5; for (let y = 0; y < WORLD_HEIGHT; y++) { if (y > groundLevel) { if (y > groundLevel + 40) { if (Math.random() < 0.03) world[x][y] = 9; else if (Math.random() < 0.08) world[x][y] = 8; else world[x][y] = 3; } else if (y > groundLevel + 1) world[x][y] = isDesert ? 6 : 2; } else if (y >= Math.floor(groundLevel)) world[x][y] = isDesert ? 6 : 1; } if (!isDesert && x > 5 && x < WORLD_WIDTH - 5 && Math.random() < 0.1) generateTree(world, x, Math.floor(groundLevel) - 1); if (isDesert && x > desertStart + 2 && x < desertStart + desertWidth - 2 && Math.random() < 0.05) generateCactus(world, x, Math.floor(groundLevel) - 1); } return world; }
function generateTree(world, x, y) { const height = Math.floor(Math.random() * 3) + 4; for (let i = 0; i < height; i++) if (y - i >= 0) world[x][y - i] = 4; const topY = y - height; for (let lx = -2; lx <= 2; lx++) for (let ly = -2; ly <= 0; ly++) if (Math.abs(lx) !== 2 || Math.abs(ly) !== 2) if (world[x + lx] && world[x + lx][topY + ly] === 0) world[x + lx][topY + ly] = 5; }
function generateCactus(world, x, y) { const height = Math.floor(Math.random() * 2) + 2; for (let i = 0; i < height; i++) if (y - i >= 0) world[x][y - i] = 7; }

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
        const playerData = { ...gameState.localPlayer, name: `Player_${userId.substring(0, 4)}`, worldId: worldCode, character: gameState.localPlayer.character, };
        const worldRef = doc(db, `artifacts/${appId}/public/data/worlds`, worldCode);
        const worldDataForFirestore = gameState.worldData.map(col => Object.assign({}, col));
        hostBtn.textContent = "UPLOADING...";
        await setDoc(worldRef, { createdAt: new Date().toISOString(), worldData: worldDataForFirestore });
        const playerRef = doc(db, `artifacts/${appId}/public/data/worlds/${worldCode}/players`, userId);
        await setDoc(playerRef, playerData);
        startGame(worldCode);
    } catch (error) {
        console.error("Error hosting world:", error);
        alert("Could not create world. A network error may have occurred.");
    } finally {
        hostBtn.disabled = false;
        hostBtn.textContent = "Host New World";
    }
}
async function joinWorld(worldCode) { const joinBtn = document.getElementById('join-confirm-btn'); joinBtn.disabled = true; joinBtn.textContent = "JOINING..."; if (!worldCode || worldCode.length !== 6) { alert("Invalid World Code."); joinBtn.disabled = false; joinBtn.textContent = "Join"; return; } gameState.worldId = worldCode.toUpperCase(); const worldRef = doc(db, `artifacts/${appId}/public/data/worlds`, gameState.worldId); try { const worldSnap = await getDoc(worldRef); if (!worldSnap.exists()) { alert("World not found."); return; } respawnPlayer(); const playerData = { ...gameState.localPlayer, name: `Player_${userId.substring(0, 4)}`, worldId: gameState.worldId, character: gameState.localPlayer.character, }; const playerRef = doc(db, `artifacts/${appId}/public/data/worlds/${gameState.worldId}/players`, userId); await setDoc(playerRef, playerData); document.getElementById('join-world-modal').classList.add('hidden'); startGame(gameState.worldId); } catch (error) { console.error("Error joining world:", error); alert("Could not join world."); } finally { joinBtn.disabled = false; joinBtn.textContent = "Join"; } }
async function sendPlayerData() { if (!gameState.worldId || !userId) return; const playerRef = doc(db, `artifacts/${appId}/public/data/worlds/${gameState.worldId}/players`, userId); try { await updateDoc(playerRef, { x: gameState.localPlayer.x, y: gameState.localPlayer.y, health: gameState.localPlayer.health, character: gameState.localPlayer.character, inventory: gameState.localPlayer.inventory, hotbar: gameState.localPlayer.hotbar, selectedHotbarSlot: gameState.localPlayer.selectedHotbarSlot }); } catch (e) { /* silent fail is ok here */ } }
async function exitToMenu() { if (worldUnsubscribe) worldUnsubscribe(); if (playersUnsubscribe) playersUnsubscribe(); worldUnsubscribe = playersUnsubscribe = null; if (gameState.worldId && userId) { const playerRef = doc(db, `artifacts/${appId}/public/data/worlds/${gameState.worldId}/players`, userId); await deleteDoc(playerRef).catch(e => console.error("Could not delete player doc", e)); } gameState.worldId = null; gameState.isPaused = false; gameState.isInventoryOpen = false; gameContainer.classList.add('hidden'); document.getElementById('pause-menu').classList.add('hidden'); document.getElementById('inventory-screen').classList.add('hidden'); mainMenu.classList.add('hidden'); showCharacterSelect(); }
function generateWorldCode() { const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789'; return Array.from({ length: 6 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join(''); }
function startGame(worldId) { mainMenu.classList.add('hidden'); gameContainer.classList.remove('hidden'); worldCanvas.width = WORLD_WIDTH * TILE_SIZE; worldCanvas.height = WORLD_HEIGHT * TILE_SIZE; gameState.isWorldDirty = true; const worldRef = doc(db, `artifacts/${appId}/public/data/worlds`, worldId); const playersCol = collection(db, `artifacts/${appId}/public/data/worlds/${worldId}/players`); worldUnsubscribe = onSnapshot(worldRef, (docSnap) => { if (docSnap.exists()) { const data = docSnap.data(); const worldArray = []; if (data.worldData) { Object.keys(data.worldData).sort((a, b) => parseInt(a) - parseInt(b)).forEach(x => { worldArray[parseInt(x)] = []; Object.keys(data.worldData[x]).sort((a, b) => parseInt(a) - parseInt(b)).forEach(y => { worldArray[parseInt(x)][parseInt(y)] = data.worldData[x][y]; }); }); } if (JSON.stringify(gameState.worldData) !== JSON.stringify(worldArray)) { gameState.worldData = worldArray; gameState.isWorldDirty = true; } } else { exitToMenu(); alert("The world has been closed."); } }); playersUnsubscribe = onSnapshot(playersCol, (snapshot) => { const newPlayers = {}; snapshot.forEach(doc => { newPlayers[doc.id] = doc.data(); }); gameState.players = newPlayers; if (newPlayers[userId]) { const { x, y, vx, vy, onGround, ...serverState } = newPlayers[userId]; Object.assign(gameState.localPlayer, serverState); } updateHUD(); }); resizeCanvas(); setupControls(); lastTime = performance.now(); requestAnimationFrame(gameLoop); }

// --- Inventory & Crafting ---
function getDropFromTile(tileId) { switch (tileId) { case 1: case 2: return 'stone'; case 3: return 'stone'; case 4: return 'wood'; case 6: return 'sand'; case 7: return 'wood'; case 8: return 'coal'; case 9: return 'iron_ore'; case 10: return 'crafting_bench'; case 11: return 'wood_planks'; default: return null; } }
function addToInventory(itemType, count) { const p = gameState.localPlayer; p.inventory[itemType] = (p.inventory[itemType] || 0) + count; updateHotbarFromInventory(); updateInventoryScreen(); }
function removeFromInventory(itemType, count) { const p = gameState.localPlayer; if (p.inventory[itemType] && p.inventory[itemType] >= count) { p.inventory[itemType] -= count; if (p.inventory[itemType] <= 0) delete p.inventory[itemType]; updateHotbarFromInventory(); updateInventoryScreen(); return true; } return false; }
function updateHotbarFromInventory() { const p = gameState.localPlayer; const invItems = Object.keys(p.inventory); for (let i = 0; i < p.hotbar.length; i++) { const itemType = invItems[i]; if (itemType) p.hotbar[i] = { type: itemType, count: p.inventory[itemType] }; else p.hotbar[i] = null; } updateHUD(); }
function craftItem(itemType, recipe) { if (!checkCanCraft(recipe)) return; for (const [item, count] of Object.entries(recipe.requires)) removeFromInventory(item, count); addToInventory(itemType, recipe.quantity); }
function checkCanCraft(recipe) { for (const [item, count] of Object.entries(recipe.requires)) if (!gameState.localPlayer.inventory[item] || gameState.localPlayer.inventory[item] < count) return false; return true; }

// --- UI Management ---
function showCharacterSelect() { const charGrid = document.getElementById('character-grid'); charGrid.innerHTML = ''; Object.keys(CHARACTER_DATA).forEach(charKey => { const char = CHARACTER_DATA[charKey]; const option = document.createElement('div'); option.className = 'character-option'; option.dataset.charKey = charKey; const headSprite = assets.sprites.characters[char.head]; const bodySprite = assets.sprites.characters[char.body]; if (headSprite && bodySprite) option.innerHTML = `<div class="character-preview"><img src="${assets.images.characters.src}" style="object-position: -${bodySprite.x}px -${bodySprite.y}px; width: ${assets.images.characters.width}px; height: ${assets.images.characters.height}px; transform: translate(25px, 20px) scale(2);"><img src="${assets.images.characters.src}" style="object-position: -${headSprite.x}px -${headSprite.y}px; width: ${assets.images.characters.width}px; height: ${assets.images.characters.height}px; transform: translate(20px, 0px) scale(1.8);"></div><p class="mt-4 uppercase">${charKey}</p>`; option.onclick = () => selectCharacter(charKey, option); charGrid.appendChild(option); }); charGrid.querySelector(`[data-char-key="${gameState.localPlayer.character}"]`)?.classList.add('selected'); charSelectScreen.classList.remove('hidden'); }
function selectCharacter(charKey, selectedElement) { gameState.localPlayer.character = charKey; document.querySelectorAll('.character-option').forEach(opt => opt.classList.remove('selected')); selectedElement.classList.add('selected'); }
function updateHUD() { const healthBar = document.getElementById('health-bar'); healthBar.innerHTML = ''; for (let i = 0; i < gameState.localPlayer.maxHealth; i++) { const heart = document.createElement('span'); heart.textContent = i < gameState.localPlayer.health ? '♥' : '♡'; heart.className = i < gameState.localPlayer.health ? 'text-red-500' : 'text-gray-500'; healthBar.appendChild(heart); } const hotbarEl = document.getElementById('hotbar'); hotbarEl.innerHTML = ''; gameState.localPlayer.hotbar.forEach((item, index) => { const slot = document.createElement('div'); slot.className = 'hotbar-slot'; if (index === gameState.localPlayer.selectedHotbarSlot) slot.classList.add('selected'); if (item) { const itemData = ITEM_DATA[item.type]; const itemImage = assets.images.items; if(itemImage && itemData && assets.sprites.items[itemData.sprite]) { const spriteData = assets.sprites.items[itemData.sprite]; const img = document.createElement('img'); img.style.objectFit = 'none'; img.style.width = `${spriteData.width}px`; img.style.height = `${spriteData.height}px`; img.style.objectPosition = `-${spriteData.x}px -${spriteData.y}px`; img.src = itemImage.src; img.style.transform = 'scale(0.5)'; slot.appendChild(img); } const countEl = document.createElement('span'); countEl.className = 'item-count'; countEl.textContent = item.count; slot.appendChild(countEl); } slot.onclick = () => { gameState.localPlayer.selectedHotbarSlot = index; updateHUD(); }; hotbarEl.appendChild(slot); }); }
function togglePause() { gameState.isPaused = !gameState.isPaused; const pauseMenu = document.getElementById('pause-menu'); if (gameState.isPaused) { document.getElementById('pause-world-code').textContent = gameState.worldId; pauseMenu.classList.remove('hidden'); } else { pauseMenu.classList.add('hidden'); lastTime = performance.now(); requestAnimationFrame(gameLoop); } }
function toggleInventory() { gameState.isInventoryOpen = !gameState.isInventoryOpen; const invScreen = document.getElementById('inventory-screen'); if (gameState.isInventoryOpen) { updateInventoryScreen(); invScreen.classList.remove('hidden'); } else { invScreen.classList.add('hidden'); lastTime = performance.now(); requestAnimationFrame(gameLoop); } }
function updateInventoryScreen() { if (!gameState.isInventoryOpen) return; const invGrid = document.getElementById('inventory-grid'); invGrid.innerHTML = ''; const slotsCount = 40; for (let i = 0; i < slotsCount; i++) { const slot = document.createElement('div'); slot.className = 'hotbar-slot'; invGrid.appendChild(slot); } Object.entries(gameState.localPlayer.inventory).forEach(([itemType, count], index) => { const slot = invGrid.children[index]; if (slot) { const itemData = ITEM_DATA[itemType]; const itemImage = assets.images.items; if(itemImage && itemData && assets.sprites.items[itemData.sprite]) { const spriteData = assets.sprites.items[itemData.sprite]; const img = document.createElement('img'); img.style.objectFit = 'none'; img.style.width = `${spriteData.width}px`; img.style.height = `${spriteData.height}px`; img.style.objectPosition = `-${spriteData.x}px -${spriteData.y}px`; img.src = itemImage.src; img.style.transform = 'scale(0.6)'; slot.appendChild(img); } const countEl = document.createElement('span'); countEl.className = 'item-count'; countEl.textContent = count; slot.appendChild(countEl); } }); updateCraftingList(); }
function updateCraftingList() { const recipesEl = document.getElementById('crafting-recipes'); recipesEl.innerHTML = ''; for (const [itemType, recipeData] of Object.entries(CRAFTING_RECIPES)) { const canCraft = checkCanCraft(recipeData); const recipeEl = document.createElement('div'); recipeEl.className = 'recipe'; if (canCraft) recipeEl.classList.add('can-craft'); const resultItemData = ITEM_DATA[itemType]; const itemImage = assets.images.items; let reqText = Object.entries(recipeData.requires).map(([reqItem, reqCount]) => `${reqCount} ${ITEM_DATA[reqItem].name}`).join(', '); recipeEl.innerHTML = `<div class="flex items-center gap-2"><div class="w-10 h-10 bg-gray-700 flex items-center justify-center" id="recipe-img-${itemType}"></div><div><span>${resultItemData.name} x${recipeData.quantity}</span><br><small class="text-gray-400">${reqText}</small></div></div>`; if (canCraft) recipeEl.onclick = () => craftItem(itemType, recipeData); recipesEl.appendChild(recipeEl); if (itemImage && resultItemData && assets.sprites.items[resultItemData.sprite]) { const resultSprite = assets.sprites.items[resultItemData.sprite]; const imgContainer = document.getElementById(`recipe-img-${itemType}`); const img = document.createElement('img'); img.style.objectFit = 'none'; img.style.width = `${resultSprite.width}px`; img.style.height = `${resultSprite.height}px`; img.style.objectPosition = `-${resultSprite.x}px -${resultSprite.y}px`; img.src = itemImage.src; img.style.transform = 'scale(0.5)'; imgContainer.appendChild(img); } } }

// --- Controls & Event Listeners ---
function setupControls() { window.addEventListener('keydown', (e) => { if (document.activeElement.tagName === 'INPUT') return; if (e.key.toLowerCase() === 'e') { toggleInventory(); return; } if (gameState.isInventoryOpen || gameState.isPaused) return; switch (e.key.toLowerCase()) { case 'a': case 'arrowleft': input.left = true; break; case 'd': case 'arrowright': input.right = true; break; case ' ': case 'w': case 'arrowup': input.jump = true; break; } }); window.addEventListener('keyup', (e) => { switch (e.key.toLowerCase()) { case 'a': case 'arrowleft': input.left = false; break; case 'd': case 'arrowright': input.right = false; break; case ' ': case 'w': case 'arrowup': input.jump = false; break; } }); canvas.addEventListener('mousedown', (e) => handleAction(e)); if ('ontouchstart' in window) { document.getElementById('mobile-controls').classList.remove('hidden'); const dpadLeft = document.getElementById('d-pad-left'), dpadRight = document.getElementById('d-pad-right'), jumpBtn = document.getElementById('jump-button'), actionBtn = document.getElementById('action-button'); dpadLeft.addEventListener('touchstart', (e) => { e.preventDefault(); input.left = true; }); dpadLeft.addEventListener('touchend', (e) => { e.preventDefault(); input.left = false; }); dpadRight.addEventListener('touchstart', (e) => { e.preventDefault(); input.right = true; }); dpadRight.addEventListener('touchend', (e) => { e.preventDefault(); input.right = false; }); jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); input.jump = true; }); jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); input.jump = false; }); actionBtn.addEventListener('touchstart', (e) => { e.preventDefault(); handleAction(e); }); } window.addEventListener('resize', resizeCanvas); }
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; gameState.isWorldDirty = true; }
function handleAction(event) { if (gameState.isPaused || gameState.isInventoryOpen) return; const rect = canvas.getBoundingClientRect(); const clickX = (event.clientX || event.touches[0].clientX) - rect.left; const clickY = (event.clientY || event.touches[0].clientY) - rect.top; const worldX = clickX + camera.x; const worldY = clickY + camera.y; const tileX = Math.floor(worldX / TILE_SIZE); const tileY = Math.floor(worldY / TILE_SIZE); const selectedItem = gameState.localPlayer.hotbar[gameState.localPlayer.selectedHotbarSlot]; if (selectedItem && ITEM_DATA[selectedItem.type]?.placeable) { placeBlock(tileX, tileY, ITEM_DATA[selectedItem.type].tileId, selectedItem.type); } else { breakBlock(tileX, tileY); } }
async function breakBlock(x, y) { if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return; const originalTileId = gameState.worldData[x]?.[y]; if (!originalTileId) return; spawnBlockParticles(x, y, originalTileId); const blockToDrop = getDropFromTile(originalTileId); if (blockToDrop) addToInventory(blockToDrop, 1); gameState.worldData[x][y] = 0; gameState.isWorldDirty = true; if (gameState.worldId) { const worldRef = doc(db, `artifacts/${appId}/public/data/worlds`, gameState.worldId); await updateDoc(worldRef, { [`worldData.${x}.${y}`]: 0 }); } }
async function placeBlock(x, y, tileId, itemType) { if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return; if (gameState.worldData[x]?.[y] !== 0) return; if (!removeFromInventory(itemType, 1)) return; gameState.worldData[x][y] = tileId; gameState.isWorldDirty = true; if (gameState.worldId) { const worldRef = doc(db, `artifacts/${appId}/public/data/worlds`, gameState.worldId); await updateDoc(worldRef, { [`worldData.${x}.${y}`]: tileId }); } }

document.getElementById('start-game-btn').addEventListener('click', () => { charSelectScreen.classList.add('hidden'); mainMenu.classList.remove('hidden'); });
document.getElementById('host-btn').addEventListener('click', hostNewWorld);
document.getElementById('join-btn').addEventListener('click', () => { document.getElementById('join-world-modal').classList.remove('hidden'); });
document.getElementById('join-cancel-btn').addEventListener('click', () => { document.getElementById('join-world-modal').classList.add('hidden'); });
document.getElementById('join-confirm-btn').addEventListener('click', () => { const code = document.getElementById('world-code-input').value; joinWorld(code); });
document.getElementById('pause-btn').addEventListener('click', togglePause);
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('exit-btn').addEventListener('click', exitToMenu);
document.getElementById('inventory-btn').addEventListener('click', toggleInventory);
document.getElementById('close-inventory-btn').addEventListener('click', toggleInventory);

const parallaxHills = document.getElementById('parallax-hills');
const parallaxTrees = document.getElementById('parallax-trees');
mainMenu.addEventListener('mousemove', (e) => {
    const x = e.clientX / window.innerWidth - 0.5;
    parallaxHills.style.backgroundPositionX = -x * 30 + 'px';
    parallaxTrees.style.backgroundPositionX = -x * 60 + 'px';
});
