// --- Firebase Imports ---
// These lines import the necessary functions from the Firebase SDK.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Setup ---
// This configuration connects the game to your Firebase project.
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBc6LPPXabs-MvfhfYzkwg93id4ffDdHfg",
  authDomain: "acre-49540.firebaseapp.com",
  projectId: "acre-49540",
  storageBucket: "acre-49540.firebasestorage.app",
  messagingSenderId: "845010622970",
  appId: "1:845010622970:web:496a3cbe8bab2a6e3e6c43",
  measurementId: "G-XJ0D283DXC"
};
const appId = 'acre-49540'; // Using your projectId as the appId

let app, auth, db, userId;

/**
 * Initializes the Firebase app and sets up authentication.
 */
function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // This listener fires whenever the user's sign-in state changes.
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // User is signed in.
                userId = user.uid;
                document.getElementById('loading-status').textContent = 'Ready to play!';
            } else {
                // User is signed out. Attempt to sign them in anonymously.
                await signInAnonymously(auth);
            }
        });

        // Handle custom authentication tokens if provided by the environment.
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            signInWithCustomToken(auth, __initial_auth_token);
        } else {
            signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Firebase initialization failed:", error);
        document.getElementById('loading-status').textContent = 'Error: Could not connect to servers.';
    }
}

// --- Game Constants & State ---
const TILE_SIZE = 32;
const WORLD_WIDTH = 300;
const WORLD_HEIGHT = 150;
const GRAVITY = 0.5;
const PLAYER_SPEED = 4;
const JUMP_FORCE = -12;
const MAX_PLAYERS = 4;

// Central object to hold the entire state of the game.
let gameState = {
    worldId: null,
    worldData: [],
    players: {},
    enemies: {},
    isPaused: false,
    isInventoryOpen: false,
    localPlayer: {
        x: 0, y: 0,
        vx: 0, vy: 0,
        health: 10,
        maxHealth: 10,
        onGround: false,
        inventory: {},
        hotbar: [null, null, null, null, null],
        selectedHotbarSlot: 0,
    }
};

// --- DOM Element References ---
const mainMenu = document.getElementById('main-menu');
const gameContainer = document.getElementById('game-container');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// To store unsubscribe functions for Firestore listeners, so we can detach them later.
let worldUnsubscribe = null;
let playersUnsubscribe = null;
let enemiesUnsubscribe = null;

// --- Asset & Data Definitions ---
const TILE_TYPES = {
    0: { name: 'Sky', color: '#78a9fa', solid: false },
    1: { name: 'Grass', color: '#34a853', hardness: 1 },
    2: { name: 'Dirt', color: '#8b5e3c', hardness: 1 },
    3: { name: 'Stone', color: '#808080', hardness: 2 },
    4: { name: 'Wood', color: '#966F33', solid: false, hardness: 1 },
    5: { name: 'Leaves', color: '#34a853', solid: false, hardness: 0.5 },
    6: { name: 'Sand', color: '#f4e4a4', hardness: 1 },
    7: { name: 'Cactus', color: '#5f9953', hardness: 1 },
    8: { name: 'Coal', color: '#36454F', hardness: 3 },
    9: { name: 'Iron Ore', color: '#c17a58', hardness: 4 },
    10: { name: 'Crafting Bench', color: '#a0522d', hardness: 2 },
};

const ITEM_DATA = {
    'wood': { name: 'Wood', tileId: 4, placeable: true },
    'stone': { name: 'Stone', tileId: 3, placeable: true },
    'sand': { name: 'Sand', tileId: 6, placeable: true },
    'gel': { name: 'Gel', color: '#42a5f5' },
    'coal': { name: 'Coal', tileId: 8, placeable: true },
    'iron_ore': { name: 'Iron Ore', tileId: 9, placeable: true },
    'wooden_pickaxe': { name: 'Wooden Pickaxe', tool: 'pickaxe', power: 1 },
    'stone_pickaxe': { name: 'Stone Pickaxe', tool: 'pickaxe', power: 2 },
    'wooden_axe': { name: 'Wooden Axe', tool: 'axe', power: 1 },
    'stone_axe': { name: 'Stone Axe', tool: 'axe', power: 2 },
    'stone_blade': { name: 'Stone Blade', tool: 'weapon', power: 2 },
    'crafting_bench': { name: 'Crafting Bench', tileId: 10, placeable: true },
    'torch': { name: 'Torch', color: '#ffeb3b', placeable: true, light: 8 }
};

const CRAFTING_RECIPES = {
    'wooden_pickaxe': { requires: { 'wood': 4 }, quantity: 1 },
    'wooden_axe': { requires: { 'wood': 4 }, quantity: 1 },
    'crafting_bench': { requires: { 'wood': 10 }, quantity: 1 },
    'torch': { requires: { 'wood': 1, 'gel': 1 }, quantity: 4 },
    'stone_pickaxe': { requires: { 'wood': 2, 'stone': 3 }, quantity: 1, bench: true },
    'stone_axe': { requires: { 'wood': 2, 'stone': 3 }, quantity: 1, bench: true },
    'stone_blade': { requires: { 'wood': 1, 'stone': 2 }, quantity: 1, bench: true },
};

// --- Game Setup & Loop ---
let lastTime = 0;
let camera = { x: 0, y: 0 };
let input = { left: false, right: false, jump: false, action: false };

function gameLoop(timestamp) {
    if (gameState.isPaused || gameState.isInventoryOpen) {
        requestAnimationFrame(gameLoop); // Keep loop running to check for resume
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
    updateCamera();
    // Periodically send this player's data to Firestore for others to see.
    if (Math.random() < 0.1) { // Throttled to ~6 times per second
        sendPlayerData();
    }
}

function draw() {
    // Disable anti-aliasing to keep the pixel art crisp
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;

    // Clear canvas with a sky color
    ctx.fillStyle = TILE_TYPES[0].color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Translate the canvas context to simulate a camera following the player
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    drawWorld();
    drawPlayers();
    
    ctx.restore();
}

// --- World Generation ---
function generateWorld() {
    let world = Array(WORLD_WIDTH).fill(0).map(() => Array(WORLD_HEIGHT).fill(0));
    const surfaceLevel = WORLD_HEIGHT / 2.5;
    const desertWidth = Math.floor(WORLD_WIDTH * 0.3);
    const desertStart = Math.random() < 0.5 ? 0 : WORLD_WIDTH - desertWidth;

    for (let x = 0; x < WORLD_WIDTH; x++) {
        const isDesert = x >= desertStart && x < desertStart + desertWidth;
        const groundLevel = surfaceLevel + Math.sin(x / 20) * 5;

        for (let y = 0; y < WORLD_HEIGHT; y++) {
            if (y > groundLevel) {
                 if (y > groundLevel + 10) { // Deep underground
                    if (Math.random() < 0.05) world[x][y] = 8; // Coal
                    else if (Math.random() < 0.03 && y > groundLevel + 30) world[x][y] = 9; // Iron
                    else world[x][y] = 3; // Stone
                } else { // Just below surface
                    world[x][y] = isDesert ? 6 : 2; // Sand or Dirt
                }
            } else if (y === Math.floor(groundLevel)) {
                 world[x][y] = isDesert ? 6 : 1; // Sand or Grass on surface
            }
        }
         // Add features like trees and cacti
        if (!isDesert && x > 5 && x < WORLD_WIDTH - 5 && Math.random() < 0.1) {
            generateTree(world, x, Math.floor(groundLevel) - 1);
        }
        if (isDesert && x > desertStart + 2 && x < desertStart + desertWidth - 2 && Math.random() < 0.05) {
            generateCactus(world, x, Math.floor(groundLevel) - 1);
        }
    }
    return world;
}

function generateTree(world, x, y) {
    const height = Math.floor(Math.random() * 3) + 4;
    for(let i=0; i<height; i++) {
        if(y-i >= 0) world[x][y-i] = 4; // Wood
    }
    // Leaves
    const topY = y-height;
    for(let lx = -2; lx <= 2; lx++) {
        for(let ly = -2; ly <= 0; ly++) {
            if (lx === 0 && ly === 0) continue; // Skip center
            if(Math.random() < 0.7 && world[x+lx] && world[x+lx][topY+ly] === 0) {
                world[x+lx][topY+ly] = 5;
            }
        }
    }
}

function generateCactus(world, x, y) {
    const height = Math.floor(Math.random() * 2) + 2;
    for(let i=0; i<height; i++) {
        if(y-i >= 0) world[x][y-i] = 7;
    }
}

// --- Drawing Functions ---
function drawWorld() {
    const startCol = Math.floor(camera.x / TILE_SIZE);
    const endCol = startCol + (canvas.width / TILE_SIZE) + 2;
    const startRow = Math.floor(camera.y / TILE_SIZE);
    const endRow = startRow + (canvas.height / TILE_SIZE) + 2;

    for (let x = startCol; x <= endCol; x++) {
        for (let y = startRow; y <= endRow; y++) {
            if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) continue;
            
            const tileId = gameState.worldData[x] ? gameState.worldData[x][y] : 0;
            if (tileId > 0) {
                ctx.fillStyle = TILE_TYPES[tileId].color;
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }
}

function drawPlayers() {
    for (const pId in gameState.players) {
        const player = gameState.players[pId];
        if (!player) continue;

        // Draw a simple rectangle for the player character
        ctx.fillStyle = pId === userId ? '#ff4141' : '#417cff'; // Red for local, blue for others
        ctx.fillRect(player.x, player.y, TILE_SIZE, TILE_SIZE * 2);

        // Draw player name above their head
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(player.name || pId.substring(0, 5), player.x + TILE_SIZE / 2, player.y - 10);
    }
}

function updateHUD() {
    // Health
    const healthBar = document.getElementById('health-bar');
    healthBar.innerHTML = '';
    for(let i=0; i<gameState.localPlayer.maxHealth; i++) {
        const heart = document.createElement('span');
        heart.textContent = i < gameState.localPlayer.health ? '♥' : '♡';
        heart.className = i < gameState.localPlayer.health ? 'text-red-500' : 'text-gray-500';
        healthBar.appendChild(heart);
    }

    // Hotbar
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
            // Display item info in the slot
            slot.textContent = itemData.name.substring(0, 4);
            const countEl = document.createElement('span');
            countEl.className = 'item-count';
            countEl.textContent = item.count;
            slot.appendChild(countEl);
        }
        slot.onclick = () => {
            gameState.localPlayer.selectedHotbarSlot = index;
            updateHUD(); // Redraw HUD to show new selection
        };
        hotbarEl.appendChild(slot);
    });
}

function updateCamera() {
    camera.x = gameState.localPlayer.x - canvas.width / 2 + TILE_SIZE / 2;
    camera.y = gameState.localPlayer.y - canvas.height / 2 + TILE_SIZE;
    
    // Clamp camera to world bounds to prevent seeing outside the world
    camera.x = Math.max(0, Math.min(camera.x, WORLD_WIDTH * TILE_SIZE - canvas.width));
    camera.y = Math.max(0, Math.min(camera.y, WORLD_HEIGHT * TILE_SIZE - canvas.height));
}

// --- Player Logic ---
function updatePlayer(deltaTime) {
    const player = gameState.localPlayer;
    if (input.left) player.vx = -PLAYER_SPEED;
    else if (input.right) player.vx = PLAYER_SPEED;
    else player.vx = 0;

    player.vy += GRAVITY;

    if (input.jump && player.onGround) {
        player.vy = JUMP_FORCE;
        player.onGround = false;
    }

    // Collision detection
    let newX = player.x + player.vx;
    let newY = player.y + player.vy;
    player.onGround = false;
    
    // Check for collision on the X axis
    if (checkCollision(newX, player.y)) {
        newX = player.x;
        player.vx = 0;
    }
    
    // Check for collision on the Y axis
    if (checkCollision(newX, newY)) {
        if(player.vy > 0) { // Moving down
            player.onGround = true;
            newY = Math.floor(newY / TILE_SIZE) * TILE_SIZE - (TILE_SIZE * 2);
        } else if(player.vy < 0) { // Moving up
            newY = (Math.floor(player.y / TILE_SIZE)) * TILE_SIZE;
        }
        player.vy = 0;
    }

    player.x = newX;
    player.y = newY;
    
    // Respawn if player falls out of the world
    if(player.y > (WORLD_HEIGHT - 3) * TILE_SIZE) {
        respawnPlayer();
    }
}

function checkCollision(x, y) {
    // Define the player's bounding box
    const playerLeft = Math.floor(x / TILE_SIZE);
    const playerRight = Math.floor((x + TILE_SIZE - 1) / TILE_SIZE);
    const playerTop = Math.floor(y / TILE_SIZE);
    const playerBottom = Math.floor((y + TILE_SIZE * 2 - 1) / TILE_SIZE);

    // Check every tile the player is touching
    for (let tx = playerLeft; tx <= playerRight; tx++) {
        for (let ty = playerTop; ty <= playerBottom; ty++) {
            if (isTileSolid(tx, ty)) {
                return true; // Collision detected
            }
        }
    }
    return false; // No collision
}

function isTileSolid(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return true; // World edge is solid
    const tileId = gameState.worldData[x] ? gameState.worldData[x][y] : 0;
    return tileId > 0 && TILE_TYPES[tileId].solid !== false;
}

function respawnPlayer() {
    const player = gameState.localPlayer;
    player.x = (WORLD_WIDTH / 2) * TILE_SIZE;
    player.y = (WORLD_HEIGHT / 2.5 - 5) * TILE_SIZE;
    player.vx = 0;
    player.vy = 0;
    player.health = player.maxHealth;
    updateHUD();
}

function handleAction(event) {
    if (gameState.isPaused || gameState.isInventoryOpen) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = (event.clientX || event.touches[0].clientX) - rect.left;
    const clickY = (event.clientY || event.touches[0].clientY) - rect.top;
    
    // Convert screen coordinates to world coordinates
    const worldX = clickX + camera.x;
    const worldY = clickY + camera.y;
    
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    const selectedItem = gameState.localPlayer.hotbar[gameState.localPlayer.selectedHotbarSlot];
    if (selectedItem && ITEM_DATA[selectedItem.type]?.placeable) {
        placeBlock(tileX, tileY, ITEM_DATA[selectedItem.type].tileId);
    } else {
        breakBlock(tileX, tileY);
    }
}

async function breakBlock(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;
    const originalTileId = gameState.worldData[x]?.[y];
    if (!originalTileId) return;
    
    // TODO: check tool power vs block hardness
    
    // Update local state immediately for responsiveness
    const blockToDrop = getDropFromTile(originalTileId);
    if (blockToDrop) {
         addToInventory(blockToDrop, 1);
    }
    gameState.worldData[x][y] = 0;

    // Send update to Firestore
    if (gameState.worldId) {
        const worldRef = doc(db, `artifacts/${appId}/public/data/worlds`, gameState.worldId);
        // Use dot notation to update a specific element in the nested array (as an object)
        const updatePath = `worldData.${x}.${y}`;
        await updateDoc(worldRef, { [updatePath]: 0 });
    }
}

async function placeBlock(x, y, tileId) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;
    if (gameState.worldData[x]?.[y] !== 0) return; // Can't place on existing block

    const itemType = Object.keys(ITEM_DATA).find(key => ITEM_DATA[key].tileId === tileId);
    if(!itemType || !removeFromInventory(itemType, 1)) {
        return; // Don't place if player doesn't have the item
    }

    // Update local state
    gameState.worldData[x][y] = tileId;

    // Send update to Firestore
    if (gameState.worldId) {
        const worldRef = doc(db, `artifacts/${appId}/public/data/worlds`, gameState.worldId);
        const updatePath = `worldData.${x}.${y}`;
        await updateDoc(worldRef, { [updatePath]: tileId });
    }
}

function getDropFromTile(tileId) {
    switch(tileId) {
        case 1: case 2: return 'stone'; // grass/dirt drops stone
        case 3: return 'stone';
        case 4: case 5: return 'wood'; // tree trunk/leaves drop wood
        case 6: return 'sand';
        case 7: return 'wood'; // cactus drops wood
        case 8: return 'coal';
        case 9: return 'iron_ore';
        case 10: return 'crafting_bench';
        default: return null;
    }
}

// --- Inventory & Crafting Logic ---
function addToInventory(itemType, count) {
    const player = gameState.localPlayer;
    player.inventory[itemType] = (player.inventory[itemType] || 0) + count;
    updateHotbarFromInventory();
    updateInventoryScreen(); // Update if open
}

function removeFromInventory(itemType, count) {
    const player = gameState.localPlayer;
    if (player.inventory[itemType] && player.inventory[itemType] >= count) {
        player.inventory[itemType] -= count;
        if (player.inventory[itemType] <= 0) {
            delete player.inventory[itemType];
        }
        updateHotbarFromInventory();
        updateInventoryScreen();
        return true;
    }
    return false;
}

function updateHotbarFromInventory() {
    // A simple sync: first 5 inventory items go to hotbar.
    const invItems = Object.keys(gameState.localPlayer.inventory);
    for(let i=0; i < gameState.localPlayer.hotbar.length; i++) {
        const itemType = invItems[i];
        if (itemType) {
            gameState.localPlayer.hotbar[i] = { type: itemType, count: gameState.localPlayer.inventory[itemType] };
        } else {
            gameState.localPlayer.hotbar[i] = null;
        }
    }
    updateHUD();
}

// --- UI & Controls Setup ---
function setupControls() {
    window.addEventListener('keydown', (e) => {
        if(gameState.isInventoryOpen || gameState.isPaused) return;
        switch(e.key.toLowerCase()) {
            case 'a': case 'arrowleft': input.left = true; break;
            case 'd': case 'arrowright': input.right = true; break;
            case ' ': case 'w': case 'arrowup': input.jump = true; break;
        }
    });
    window.addEventListener('keyup', (e) => {
        switch(e.key.toLowerCase()) {
            case 'a': case 'arrowleft': input.left = false; break;
            case 'd': case 'arrowright': input.right = false; break;
            case ' ': case 'w': case 'arrowup': input.jump = false; break;
        }
    });
    canvas.addEventListener('mousedown', handleAction);
    
    // Setup mobile controls if on a touch device
    if ('ontouchstart' in window) {
        document.getElementById('mobile-controls').classList.remove('hidden');
        
        const dpadLeft = document.getElementById('d-pad-left');
        const dpadRight = document.getElementById('d-pad-right');
        const jumpBtn = document.getElementById('jump-button');
        const actionBtn = document.getElementById('action-button');

        dpadLeft.addEventListener('touchstart', (e) => { e.preventDefault(); input.left = true; });
        dpadLeft.addEventListener('touchend', (e) => { e.preventDefault(); input.left = false; });
        dpadRight.addEventListener('touchstart', (e) => { e.preventDefault(); input.right = true; });
        dpadRight.addEventListener('touchend', (e) => { e.preventDefault(); input.right = false; });
        jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); input.jump = true; });
        jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); input.jump = false; });
        actionBtn.addEventListener('touchstart', (e) => { 
            e.preventDefault(); 
            handleAction(e);
        });
    }

    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function togglePause() {
    gameState.isPaused = !gameState.isPaused;
    const pauseMenu = document.getElementById('pause-menu');
    if (gameState.isPaused) {
        document.getElementById('pause-world-code').textContent = gameState.worldId;
        pauseMenu.classList.remove('hidden');
    } else {
        pauseMenu.classList.add('hidden');
        // Resume game loop
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
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
        // Resume game loop
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    }
}

function updateInventoryScreen() {
    if (!gameState.isInventoryOpen) return;
    const invGrid = document.getElementById('inventory-grid');
    invGrid.innerHTML = '';
    // Create 25 inventory slots
    for(let i=0; i<25; i++) {
        const slot = document.createElement('div');
        slot.className = 'hotbar-slot';
        invGrid.appendChild(slot);
    }
    // Populate slots with items from inventory
    Object.entries(gameState.localPlayer.inventory).forEach(([itemType, count], index) => {
         const slot = invGrid.children[index];
         if(slot) {
            const itemData = ITEM_DATA[itemType];
            slot.textContent = itemData.name.substring(0,4);
            const countEl = document.createElement('span');
            countEl.className = 'item-count';
            countEl.textContent = count;
            slot.appendChild(countEl);
         }
    });
    updateCraftingList();
}

function updateCraftingList() {
    const recipesEl = document.getElementById('crafting-recipes');
    recipesEl.innerHTML = '';
    for (const [itemType, recipeData] of Object.entries(CRAFTING_RECIPES)) {
        const canCraft = checkCanCraft(recipeData);
        const recipeEl = document.createElement('div');
        recipeEl.className = 'recipe p-2 mb-2';
        if(canCraft) recipeEl.classList.add('can-craft');

        const itemName = ITEM_DATA[itemType].name;
        let reqText = Object.entries(recipeData.requires).map(([reqItem, reqCount]) => `${reqCount} ${ITEM_DATA[reqItem].name}`).join(', ');
        
        recipeEl.innerHTML = `<span>${itemName} x${recipeData.quantity}</span><br><small>${reqText}</small>`;
        if (canCraft) {
            recipeEl.onclick = () => craftItem(itemType, recipeData);
        }
        recipesEl.appendChild(recipeEl);
    }
}

function checkCanCraft(recipe) {
    // TODO: Add check for crafting bench proximity if recipe.bench is true
    for(const [item, count] of Object.entries(recipe.requires)) {
        if(!gameState.localPlayer.inventory[item] || gameState.localPlayer.inventory[item] < count) {
            return false;
        }
    }
    return true;
}

function craftItem(itemType, recipe) {
    if(!checkCanCraft(recipe)) return;

    for(const [item, count] of Object.entries(recipe.requires)) {
        removeFromInventory(item, count);
    }
    addToInventory(itemType, recipe.quantity);
}

// --- Multiplayer & Firebase Logic ---
async function hostNewWorld() {
    const worldCode = generateWorldCode();
    gameState.worldId = worldCode;

    gameState.worldData = generateWorld();

    respawnPlayer();
    const playerData = {
        ...gameState.localPlayer,
        name: `Player_${userId.substring(0, 4)}`,
        worldId: worldCode,
    };
    
    const worldRef = doc(db, `artifacts/${appId}/public/data/worlds`, worldCode);
    try {
        // Firestore works better with objects than arrays, so we convert the columns.
        const worldDataForFirestore = gameState.worldData.map(col => Object.assign({}, col));
        await setDoc(worldRef, { 
            createdAt: new Date(),
            worldData: worldDataForFirestore
        });
        
        const playerRef = doc(db, `artifacts/${appId}/public/data/worlds/${worldCode}/players`, userId);
        await setDoc(playerRef, playerData);
        
        startGame(worldCode);

    } catch (error) {
        console.error("Error hosting world:", error);
        alert("Could not create world. Please try again.");
    }
}

async function joinWorld(worldCode) {
    if (!worldCode || worldCode.length !== 6) {
        alert("Invalid World Code.");
        return;
    }
    gameState.worldId = worldCode.toUpperCase();
    
    const worldRef = doc(db, `artifacts/${appId}/public/data/worlds`, gameState.worldId);
    const playersColRef = collection(db, `artifacts/${appId}/public/data/worlds/${gameState.worldId}/players`);
    
    try {
        const worldSnap = await getDoc(worldRef);
        if (!worldSnap.exists()) {
            alert("World not found.");
            return;
        }
        
        respawnPlayer();
        const playerData = {
            ...gameState.localPlayer,
            name: `Player_${userId.substring(0, 4)}`,
            worldId: gameState.worldId,
        };
        const playerRef = doc(playersColRef, userId);
        await setDoc(playerRef, playerData);

        startGame(gameState.worldId);

    } catch (error) {
        console.error("Error joining world:", error);
        alert("Could not join world. Check the code and try again.");
    }
}

function startGame(worldId) {
    mainMenu.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    const worldRef = doc(db, `artifacts/${appId}/public/data/worlds`, worldId);
    const playersCol = collection(db, `artifacts/${appId}/public/data/worlds/${worldId}/players`);

    // Listen for real-time updates to the world data
    worldUnsubscribe = onSnapshot(worldRef, (docSnap) => {
        if(docSnap.exists()){
            const data = docSnap.data();
            // Convert Firestore's object-based array back into a proper JavaScript array
            const worldArray = [];
            if (data.worldData) {
                Object.keys(data.worldData).sort((a,b) => a - b).forEach(x => {
                    worldArray[x] = [];
                    Object.keys(data.worldData[x]).sort((a,b) => a - b).forEach(y => {
                        worldArray[x][y] = data.worldData[x][y];
                    });
                });
            }
            gameState.worldData = worldArray;
        } else {
            exitToMenu();
            alert("The world has been closed.");
        }
    });

    // Listen for real-time updates to all players in the world
    playersUnsubscribe = onSnapshot(playersCol, (snapshot) => {
        const newPlayers = {};
        snapshot.forEach(doc => {
            newPlayers[doc.id] = doc.data();
        });
        gameState.players = newPlayers;
        
        if (newPlayers[userId]) {
            // Avoid overwriting local physics state with stale server data
            const {x, y, vx, vy, onGround, ...serverState} = newPlayers[userId];
            Object.assign(gameState.localPlayer, serverState);
        }
        updateHUD();
    });
    
    // Initial setup and start the game loop
    setupControls();
    resizeCanvas();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

async function sendPlayerData() {
    if (!gameState.worldId || !userId) return;
    const playerRef = doc(db, `artifacts/${appId}/public/data/worlds/${gameState.worldId}/players`, userId);
    try {
        // Only send data that other players need to see.
        await updateDoc(playerRef, {
            x: gameState.localPlayer.x,
            y: gameState.localPlayer.y,
            health: gameState.localPlayer.health,
            inventory: gameState.localPlayer.inventory,
            hotbar: gameState.localPlayer.hotbar,
            selectedHotbarSlot: gameState.localPlayer.selectedHotbarSlot
        });
    } catch(e) {
        // This might fail if the doc isn't created yet on join, which is okay.
        console.warn("Could not send player data:", e.message);
    }
}

async function exitToMenu() {
    // Detach all Firestore listeners to prevent memory leaks
    if (worldUnsubscribe) worldUnsubscribe();
    if (playersUnsubscribe) playersUnsubscribe();
    worldUnsubscribe = playersUnsubscribe = null;

    // Remove this player's data from the world
    if(gameState.worldId && userId) {
         const playerRef = doc(db, `artifacts/${appId}/public/data/worlds/${gameState.worldId}/players`, userId);
         await deleteDoc(playerRef).catch(e => console.error("Could not delete player doc", e));
    }

    // Reset game state and UI
    gameState.worldId = null;
    gameState.isPaused = false;
    gameState.isInventoryOpen = false;
    mainMenu.classList.remove('hidden');
    gameContainer.classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('inventory-screen').classList.add('hidden');
}

function generateWorldCode() {
    const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789'; // Omitted O and 0
    return Array.from({length: 6}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

// --- Global Event Listeners ---
document.getElementById('host-btn').addEventListener('click', hostNewWorld);
document.getElementById('join-btn').addEventListener('click', () => {
    document.getElementById('join-world-modal').classList.remove('hidden');
});
document.getElementById('join-cancel-btn').addEventListener('click', () => {
    document.getElementById('join-world-modal').classList.add('hidden');
});
document.getElementById('join-confirm-btn').addEventListener('click', () => {
    const code = document.getElementById('world-code-input').value;
    document.getElementById('join-world-modal').classList.add('hidden');
    joinWorld(code);
});
document.getElementById('pause-btn').addEventListener('click', togglePause);
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('exit-btn').addEventListener('click', exitToMenu);
document.getElementById('inventory-btn').addEventListener('click', toggleInventory);
document.getElementById('close-inventory-btn').addEventListener('click', toggleInventory);

// Main menu parallax effect
const parallaxHills = document.getElementById('parallax-hills');
const parallaxTrees = document.getElementById('parallax-trees');
mainMenu.addEventListener('mousemove', (e) => {
    const x = e.clientX / window.innerWidth - 0.5;
    parallaxHills.style.backgroundPositionX = -x * 30 + 'px';
    parallaxTrees.style.backgroundPositionX = -x * 60 + 'px';
});

// --- Initializer ---
// Start the Firebase connection once the page loads.
window.onload = initializeFirebase;
