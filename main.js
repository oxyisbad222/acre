// --- Firebase Imports ---
// These lines import the necessary functions from the Firebase SDK.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Setup ---
// This configuration connects the game to your Firebase project.
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

/**
 * Initializes the Firebase app and sets up authentication.
 */
async function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        await initializeAssets(); // Load all game assets

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                document.getElementById('loading-status').textContent = 'Ready to play!';
            } else {
                await signInAnonymously(auth);
            }
        });

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Firebase or Asset initialization failed:", error);
        document.getElementById('loading-status').textContent = 'Error: Could not connect to servers or load assets.';
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
        hotbar: [null, null, null, null, null, null, null, null], // 8 slots
        selectedHotbarSlot: 0,
    }
};

// --- DOM Element References ---
const mainMenu = document.getElementById('main-menu');
const gameContainer = document.getElementById('game-container');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let worldUnsubscribe = null;
let playersUnsubscribe = null;
let enemiesUnsubscribe = null;

// --- Asset & Data Definitions ---
const assets = {
    images: {},
    sprites: {}
};

async function loadSpriteSheet(name, xmlContent, imageUrl) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "application/xml");
    const subTextures = xmlDoc.getElementsByTagName("SubTexture");
    const sheetData = {};
    for (const subTexture of subTextures) {
        const spriteName = subTexture.getAttribute("name");
        sheetData[spriteName] = {
            x: parseInt(subTexture.getAttribute("x")),
            y: parseInt(subTexture.getAttribute("y")),
            width: parseInt(subTexture.getAttribute("width")),
            height: parseInt(subTexture.getAttribute("height"))
        };
    }
    assets.sprites[name] = sheetData;
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    assets.images[name] = image;
}

async function initializeAssets() {
    const charactersXML = `<TextureAtlas imagePath="spritesheet_characters.png">
	<SubTexture name="alien_arm.png" x="180" y="261" width="16" height="42"/> <SubTexture name="alien_body.png" x="116" y="0" width="44" height="47"/> <SubTexture name="alien_head.png" x="0" y="54" width="92" height="92"/> <SubTexture name="alien_leg.png" x="152" y="261" width="28" height="36"/> <SubTexture name="boar_body.png" x="0" y="146" width="86" height="76"/> <SubTexture name="boar_head.png" x="150" y="182" width="60" height="79"/> <SubTexture name="boar_leg.png" x="78" y="282" width="24" height="23"/> <SubTexture name="boar_tail.png" x="156" y="81" width="14" height="31"/> <SubTexture name="female_arm.png" x="254" y="185" width="28" height="66"/> <SubTexture name="female_body.png" x="210" y="241" width="44" height="59"/> <SubTexture name="female_head.png" x="0" y="222" width="78" height="72"/> <SubTexture name="female_leg.png" x="248" y="0" width="28" height="56"/> <SubTexture name="fox_body.png" x="0" y="0" width="116" height="54"/> <SubTexture name="fox_ear.png" x="102" y="282" width="12" height="20"/> <SubTexture name="fox_leg.png" x="92" y="118" width="16" height="23"/> <SubTexture name="fox_tail.png" x="78" y="262" width="40" height="20"/> <SubTexture name="gnome_arm.png" x="196" y="261" width="14" height="42"/> <SubTexture name="gnome_body.png" x="118" y="262" width="34" height="36"/> <SubTexture name="gnome_head.png" x="160" y="0" width="44" height="81"/> <SubTexture name="gnome_leg.png" x="258" y="66" width="24" height="34"/> <SubTexture name="hedgehog_body.png" x="78" y="222" width="72" height="40"/> <SubTexture name="male_arm.png" x="276" y="0" width="28" height="66"/> <SubTexture name="male_body.png" x="210" y="182" width="44" height="59"/> <SubTexture name="male_head.png" x="86" y="146" width="64" height="64"/> <SubTexture name="male_leg.png" x="214" y="119" width="28" height="56"/> <SubTexture name="skeleton_arm.png" x="282" y="122" width="20" height="66"/> <SubTexture name="skeleton_body.png" x="204" y="0" width="44" height="60"/> <SubTexture name="skeleton_head.png" x="92" y="54" width="64" height="64"/> <SubTexture name="skeleton_leg.png" x="282" y="66" width="24" height="56"/> <SubTexture name="zombie_arm.png" x="254" y="119" width="28" height="66"/> <SubTexture name="zombie_body.png" x="214" y="60" width="44" height="59"/> <SubTexture name="zombie_head.png" x="150" y="118" width="64" height="64"/> <SubTexture name="zombie_leg.png" x="214" y="119" width="28" height="56"/> </TextureAtlas>`;
    const itemsXML = `<TextureAtlas imagePath="spritesheet_items.png">
	<SubTexture name="apple.png" x="384" y="384" width="128" height="128"/> <SubTexture name="arrow.png" x="768" y="768" width="128" height="128"/> <SubTexture name="axe_bronze.png" x="768" y="640" width="128" height="128"/> <SubTexture name="axe_diamond.png" x="768" y="512" width="128" height="128"/> <SubTexture name="axe_gold.png" x="768" y="384" width="128" height="128"/> <SubTexture name="axe_iron.png" x="768" y="256" width="128" height="128"/> <SubTexture name="axe_silver.png" x="768" y="128" width="128" height="128"/> <SubTexture name="boat.png" x="768" y="0" width="128" height="128"/> <SubTexture name="bow.png" x="640" y="896" width="128" height="128"/> <SubTexture name="bowArrow.png" x="640" y="768" width="128" height="128"/> <SubTexture name="bowl.png" x="640" y="640" width="128" height="128"/> <SubTexture name="fish.png" x="640" y="512" width="128" height="128"/> <SubTexture name="fish_cooked.png" x="640" y="256" width="128" height="128"/> <SubTexture name="fishingPole.png" x="640" y="384" width="128" height="128"/> <SubTexture name="flail_bronze.png" x="640" y="128" width="128" height="128"/> <SubTexture name="flail_diamond.png" x="640" y="0" width="128" height="128"/> <SubTexture name="flail_gold.png" x="512" y="896" width="128" height="128"/> <SubTexture name="flail_iron.png" x="512" y="768" width="128" height="128"/> <SubTexture name="flail_silver.png" x="512" y="640" width="128" height="128"/> <SubTexture name="hammer_bronze.png" x="512" y="512" width="128" height="128"/> <SubTexture name="hammer_diamond.png" x="512" y="384" width="128" height="128"/> <SubTexture name="hammer_gold.png" x="512" y="256" width="128" height="128"/> <SubTexture name="hammer_iron.png" x="512" y="128" width="128" height="128"/> <SubTexture name="hammer_silver.png" x="512" y="0" width="128" height="128"/> <SubTexture name="hoe_bronze.png" x="384" y="896" width="128" height="128"/> <SubTexture name="hoe_diamond.png" x="384" y="768" width="128" height="128"/> <SubTexture name="hoe_gold.png" x="384" y="640" width="128" height="128"/> <SubTexture name="hoe_iron.png" x="384" y="512" width="128" height="128"/> <SubTexture name="hoe_silver.png" x="768" y="896" width="128" height="128"/> <SubTexture name="minecart.png" x="384" y="256" width="128" height="128"/> <SubTexture name="ore_coal.png" x="384" y="128" width="128" height="128"/> <SubTexture name="ore_diamond.png" x="384" y="0" width="128" height="128"/> <SubTexture name="ore_emerald.png" x="256" y="896" width="128" height="128"/> <SubTexture name="ore_gold.png" x="256" y="768" width="128" height="128"/> <SubTexture name="ore_iron.png" x="256" y="640" width="128" height="128"/> <SubTexture name="ore_ironAlt.png" x="256" y="512" width="128" height="128"/> <SubTexture name="ore_ruby.png" x="256" y="384" width="128" height="128"/> <SubTexture name="ore_silver.png" x="256" y="256" width="128" height="128"/> <SubTexture name="pick_bronze.png" x="256" y="128" width="128" height="128"/> <SubTexture name="pick_diamond.png" x="256" y="0" width="128" height="128"/> <SubTexture name="pick_gold.png" x="128" y="896" width="128" height="128"/> <SubTexture name="pick_iron.png" x="128" y="768" width="128" height="128"/> <SubTexture name="pick_silver.png" x="128" y="640" width="128" height="128"/> <SubTexture name="seed.png" x="128" y="512" width="128" height="128"/> <SubTexture name="shovel_bronze.png" x="128" y="384" width="128" height="128"/> <SubTexture name="shovel_diamond.png" x="128" y="256" width="128" height="128"/> <SubTexture name="shovel_gold.png" x="128" y="128" width="128" height="128"/> <SubTexture name="shovel_iron.png" x="128" y="0" width="128" height="128"/> <SubTexture name="shovel_silver.png" x="0" y="896" width="128" height="128"/> <SubTexture name="stew.png" x="0" y="768" width="128" height="128"/> <SubTexture name="sword_bronze.png" x="0" y="640" width="128" height="128"/> <SubTexture name="sword_diamond.png" x="0" y="512" width="128" height="128"/> <SubTexture name="sword_gold.png" x="0" y="384" width="128" height="128"/> <SubTexture name="sword_iron.png" x="0" y="256" width="128" height="128"/> <SubTexture name="sword_silver.png" x="0" y="128" width="128" height="128"/> <SubTexture name="wheat.png" x="0" y="0" width="128" height="128"/> </TextureAtlas>`;
    const particlesXML = `<TextureAtlas imagePath="spritesheet_particles.png"> <SubTexture name="square_blue.png" x="16" y="68" width="16" height="16"/> <SubTexture name="square_orange.png" x="32" y="68" width="16" height="16"/> <SubTexture name="square_red.png" x="48" y="68" width="16" height="16"/> <SubTexture name="square_white.png" x="0" y="68" width="16" height="16"/> <SubTexture name="swirl_blue.png" x="36" y="34" width="36" height="34"/> <SubTexture name="swirl_orange.png" x="36" y="0" width="36" height="34"/> <SubTexture name="swirl_red.png" x="0" y="34" width="36" height="34"/> <SubTexture name="swirl_white.png" x="0" y="0" width="36" height="34"/> </TextureAtlas>`;
    const tilesXML = `<TextureAtlas imagePath="spritesheet_tiles.png">
	<SubTexture name="brick_grey.png" x="512" y="256" width="128" height="128"/> <SubTexture name="brick_red.png" x="1024" y="384" width="128" height="128"/> <SubTexture name="cactus_inside.png" x="1024" y="256" width="128" height="128"/> <SubTexture name="cactus_side.png" x="1024" y="128" width="128" height="128"/> <SubTexture name="cactus_top.png" x="1024" y="0" width="128" height="128"/> <SubTexture name="cotton_blue.png" x="896" y="1152" width="128" height="128"/> <SubTexture name="cotton_green.png" x="896" y="1024" width="128" height="128"/> <SubTexture name="cotton_red.png" x="896" y="896" width="128" height="128"/> <SubTexture name="cotton_tan.png" x="896" y="768" width="128" height="128"/> <SubTexture name="dirt.png" x="896" y="640" width="128" height="128"/> <SubTexture name="dirt_grass.png" x="896" y="512" width="128" height="128"/> <SubTexture name="dirt_sand.png" x="896" y="384" width="128" height="128"/> <SubTexture name="dirt_snow.png" x="896" y="256" width="128" height="128"/> <SubTexture name="fence_stone.png" x="896" y="128" width="128" height="128"/> <SubTexture name="fence_wood.png" x="896" y="0" width="128" height="128"/> <SubTexture name="glass.png" x="768" y="1152" width="128" height="128"/> <SubTexture name="glass_frame.png" x="768" y="1024" width="128" height="128"/> <SubTexture name="grass1.png" x="768" y="896" width="128" height="128"/> <SubTexture name="grass2.png" x="768" y="768" width="128" height="128"/> <SubTexture name="grass3.png" x="768" y="640" width="128" height="128"/> <SubTexture name="grass4.png" x="768" y="512" width="128" height="128"/> <SubTexture name="grass_brown.png" x="768" y="384" width="128" height="128"/> <SubTexture name="grass_tan.png" x="768" y="256" width="128" height="128"/> <SubTexture name="grass_top.png" x="768" y="128" width="128" height="128"/> <SubTexture name="gravel_dirt.png" x="768" y="0" width="128" height="128"/> <SubTexture name="gravel_stone.png" x="640" y="1152" width="128" height="128"/> <SubTexture name="greysand.png" x="640" y="1024" width="128" height="128"/> <SubTexture name="greystone.png" x="640" y="896" width="128" height="128"/> <SubTexture name="greystone_ruby.png" x="640" y="768" width="128" height="128"/> <SubTexture name="greystone_ruby_alt.png" x="640" y="640" width="128" height="128"/> <SubTexture name="greystone_sand.png" x="640" y="512" width="128" height="128"/> <SubTexture name="ice.png" x="640" y="384" width="128" height="128"/> <SubTexture name="lava.png" x="640" y="256" width="128" height="128"/> <SubTexture name="leaves.png" x="640" y="128" width="128" height="128"/> <SubTexture name="leaves_orange.png" x="640" y="0" width="128" height="128"/> <SubTexture name="leaves_orange_transparent.png" x="512" y="1152" width="128" height="128"/> <SubTexture name="leaves_transparent.png" x="512" y="1024" width="128" height="128"/> <SubTexture name="mushroom_brown.png" x="512" y="896" width="128" height="128"/> <SubTexture name="mushroom_red.png" x="512" y="768" width="128" height="128"/> <SubTexture name="mushroom_tan.png" x="512" y="640" width="128" height="128"/> <SubTexture name="oven.png" x="512" y="512" width="128" height="128"/> <SubTexture name="redsand.png" x="512" y="384" width="128" height="128"/> <SubTexture name="redstone.png" x="1024" y="512" width="128" height="128"/> <SubTexture name="redstone_emerald.png" x="512" y="128" width="128" height="128"/> <SubTexture name="redstone_emerald_alt.png" x="512" y="0" width="128" height="128"/> <SubTexture name="redstone_sand.png" x="384" y="1152" width="128" height="128"/> <SubTexture name="rock.png" x="384" y="1024" width="128" height="128"/> <SubTexture name="rock_moss.png" x="384" y="896" width="128" height="128"/> <SubTexture name="sand.png" x="384" y="768" width="128" height="128"/> <SubTexture name="snow.png" x="384" y="640" width="128" height="128"/> <SubTexture name="stone.png" x="384" y="512" width="128" height="128"/> <SubTexture name="stone_browniron.png" x="384" y="384" width="128" height="128"/> <SubTexture name="stone_browniron_alt.png" x="384" y="256" width="128" height="128"/> <SubTexture name="stone_coal.png" x="384" y="128" width="128" height="128"/> <SubTexture name="stone_coal_alt.png" x="384" y="0" width="128" height="128"/> <SubTexture name="stone_diamond.png" x="256" y="1152" width="128" height="128"/> <SubTexture name="stone_diamond_alt.png" x="256" y="1024" width="128" height="128"/> <SubTexture name="stone_dirt.png" x="256" y="896" width="128" height="128"/> <SubTexture name="stone_gold.png" x="256" y="768" width="128" height="128"/> <SubTexture name="stone_gold_alt.png" x="256" y="640" width="128" height="128"/> <SubTexture name="stone_grass.png" x="256" y="512" width="128" height="128"/> <SubTexture name="stone_iron.png" x="256" y="384" width="128" height="128"/> <SubTexture name="stone_iron_alt.png" x="256" y="256" width="128" height="128"/> <SubTexture name="stone_sand.png" x="256" y="128" width="128" height="128"/> <SubTexture name="stone_silver.png" x="256" y="0" width="128" height="128"/> <SubTexture name="stone_silver_alt.png" x="128" y="1152" width="128" height="128"/> <SubTexture name="stone_snow.png" x="128" y="1024" width="128" height="128"/> <SubTexture name="table.png" x="128" y="896" width="128" height="128"/> <SubTexture name="track_corner.png" x="128" y="768" width="128" height="128"/> <SubTexture name="track_corner_alt.png" x="128" y="640" width="128" height="128"/> <SubTexture name="track_straight.png" x="128" y="512" width="128" height="128"/> <SubTexture name="track_straight_alt.png" x="128" y="384" width="128" height="128"/> <SubTexture name="trunk_bottom.png" x="128" y="256" width="128" height="128"/> <SubTexture name="trunk_mid.png" x="128" y="128" width="128" height="128"/> <SubTexture name="trunk_side.png" x="128" y="0" width="128" height="128"/> <SubTexture name="trunk_top.png" x="0" y="1152" width="128" height="128"/> <SubTexture name="trunk_white_side.png" x="0" y="1024" width="128" height="128"/> <SubTexture name="trunk_white_top.png" x="0" y="896" width="128" height="128"/> <SubTexture name="water.png" x="0" y="768" width="128" height="128"/> <SubTexture name="wheat_stage1.png" x="0" y="640" width="128" height="128"/> <SubTexture name="wheat_stage2.png" x="0" y="512" width="128" height="128"/> <SubTexture name="wheat_stage3.png" x="0" y="384" width="128" height="128"/> <SubTexture name="wheat_stage4.png" x="0" y="256" width="128" height="128"/> <SubTexture name="wood.png" x="0" y="128" width="128" height="128"/> <SubTexture name="wood_red.png" x="0" y="0" width="128" height="128"/> </TextureAtlas>`;
    
    await Promise.all([
        loadSpriteSheet('characters', charactersXML, 'assets/Spritesheets/spritesheet_characters.png'),
        loadSpriteSheet('items', itemsXML, 'assets/Spritesheets/spritesheet_items.png'),
        loadSpriteSheet('particles', particlesXML, 'assets/Spritesheets/spritesheet_particles.png'),
        loadSpriteSheet('tiles', tilesXML, 'assets/Spritesheets/spritesheet_tiles.png')
    ]);
}

const TILE_TYPES = {
    0: { name: 'Sky', solid: false },
    1: { name: 'Grass', sprite: 'dirt_grass.png', hardness: 1 },
    2: { name: 'Dirt', sprite: 'dirt.png', hardness: 1 },
    3: { name: 'Stone', sprite: 'stone.png', hardness: 2 },
    4: { name: 'Wood', sprite: 'trunk_mid.png', solid: false, hardness: 1.5 },
    5: { name: 'Leaves', sprite: 'leaves.png', solid: false, hardness: 0.5 },
    6: { name: 'Sand', sprite: 'sand.png', hardness: 1 },
    7: { name: 'Cactus', sprite: 'cactus_side.png', hardness: 1, damage: 1 },
    8: { name: 'Coal Ore', sprite: 'stone_coal.png', hardness: 3 },
    9: { name: 'Iron Ore', sprite: 'stone_iron.png', hardness: 4 },
    10: { name: 'Crafting Bench', sprite: 'table.png', hardness: 2 },
    11: { name: 'Wood Planks', sprite: 'wood.png', hardness: 1.5 },
};

const ITEM_DATA = {
    'wood_planks': { name: 'Wood Planks', tileId: 11, placeable: true, sprite: 'wood.png' },
    'stone': { name: 'Stone', tileId: 3, placeable: true, sprite: 'stone.png' },
    'sand': { name: 'Sand', tileId: 6, placeable: true, sprite: 'sand.png' },
    'wood': { name: 'Wood Log', tileId: 4, placeable: true, sprite: 'trunk_side.png' },
    'coal': { name: 'Coal', sprite: 'ore_coal.png'},
    'iron_ore': { name: 'Iron Ore', sprite: 'ore_iron.png' },
    'stick': { name: 'Stick', sprite: 'arrow.png'}, // Using arrow as placeholder
    'pickaxe_wood': { name: 'Wooden Pickaxe', tool: 'pickaxe', power: 1.5, sprite: 'pick_iron.png' }, // using iron as placeholder
    'pickaxe_stone': { name: 'Stone Pickaxe', tool: 'pickaxe', power: 2.5, sprite: 'pick_bronze.png' }, // using bronze as placeholder
    'axe_wood': { name: 'Wooden Axe', tool: 'axe', power: 1.5, sprite: 'axe_iron.png' }, // using iron as placeholder
    'axe_stone': { name: 'Stone Axe', tool: 'axe', power: 2.5, sprite: 'axe_bronze.png' }, // using bronze as placeholder
    'sword_stone': { name: 'Stone Sword', tool: 'weapon', power: 2, sprite: 'sword_iron.png' }, // using iron as placeholder
    'crafting_bench': { name: 'Crafting Bench', tileId: 10, placeable: true, sprite: 'table.png' },
};

const CRAFTING_RECIPES = {
    'wood_planks': { requires: { 'wood': 1 }, quantity: 4 },
    'stick': { requires: { 'wood_planks': 2 }, quantity: 4 },
    'crafting_bench': { requires: { 'wood_planks': 4 }, quantity: 1 },
    'pickaxe_wood': { requires: { 'wood_planks': 3, 'stick': 2 }, quantity: 1, bench: true },
    'axe_wood': { requires: { 'wood_planks': 3, 'stick': 2 }, quantity: 1, bench: true },
    'pickaxe_stone': { requires: { 'stone': 3, 'stick': 2 }, quantity: 1, bench: true },
    'axe_stone': { requires: { 'stone': 3, 'stick': 2 }, quantity: 1, bench: true },
    'sword_stone': { requires: { 'stone': 2, 'stick': 1 }, quantity: 1, bench: true },
};

// --- Game Setup & Loop ---
let lastTime = 0;
let camera = { x: 0, y: 0 };
let input = { left: false, right: false, jump: false, action: false };

function gameLoop(timestamp) {
    if (!assets.images.tiles) { // Wait for assets to load
        requestAnimationFrame(gameLoop);
        return;
    }
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
    updateCamera();
    if (Math.random() < 0.1) {
        sendPlayerData();
    }
}

function draw() {
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;

    ctx.fillStyle = '#78a9fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
                if (y > groundLevel + 40) {
                     if (Math.random() < 0.03) world[x][y] = 9; // Iron
                     else if (Math.random() < 0.08) world[x][y] = 8; // Coal
                     else world[x][y] = 3; // Stone
                } else if (y > groundLevel + 1) {
                    world[x][y] = isDesert ? 6 : 2; // Sand or Dirt
                }
            } else if (y >= Math.floor(groundLevel)) {
                 world[x][y] = isDesert ? 6 : 1; // Sand or Grass on surface
            }
        }
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
        if(y-i >= 0) world[x][y-i] = 4; // Wood Log
    }
    const topY = y-height;
    for(let lx = -2; lx <= 2; lx++) {
        for(let ly = -2; ly <= 0; ly++) {
            if (Math.abs(lx) === 2 && Math.abs(ly) === 2) continue;
            if(world[x+lx] && world[x+lx][topY+ly] === 0) {
                world[x+lx][topY+ly] = 5; // Leaves
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

    const tilesImage = assets.images.tiles;

    for (let x = startCol; x <= endCol; x++) {
        for (let y = startRow; y <= endRow; y++) {
            if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) continue;
            
            const tileId = gameState.worldData[x]?.[y] ?? 0;
            const tile = TILE_TYPES[tileId];

            if (tile && tile.sprite) {
                const spriteData = assets.sprites.tiles[tile.sprite];
                if(spriteData) {
                    ctx.drawImage(
                        tilesImage,
                        spriteData.x, spriteData.y, spriteData.width, spriteData.height,
                        x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE
                    );
                }
            }
        }
    }
}

function drawPlayers() {
    const charImage = assets.images.characters;
    const headSprite = assets.sprites.characters['male_head.png'];
    const bodySprite = assets.sprites.characters['male_body.png'];
    
    for (const pId in gameState.players) {
        const player = gameState.players[pId];
        if (!player || !bodySprite || !headSprite) continue;

        // Draw body and head
        ctx.drawImage(charImage, bodySprite.x, bodySprite.y, bodySprite.width, bodySprite.height, player.x, player.y, TILE_SIZE, TILE_SIZE * 1.5);
        ctx.drawImage(charImage, headSprite.x, headSprite.y, headSprite.width, headSprite.height, player.x - 5, player.y - TILE_SIZE + 5, TILE_SIZE * 1.2, TILE_SIZE * 1.2);

        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.font = "10px 'Press Start 2P'";
        ctx.fillText(player.name || pId.substring(0, 5), player.x + TILE_SIZE / 2, player.y - 20);
    }
}


function updateHUD() {
    const healthBar = document.getElementById('health-bar');
    healthBar.innerHTML = '';
    for(let i=0; i<gameState.localPlayer.maxHealth; i++) {
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
            const spriteData = assets.sprites.items[itemData.sprite];
            if(itemImage && spriteData) {
                const img = document.createElement('img');
                // This is a trick to use the spritesheet in an img tag
                img.style.objectFit = 'none';
                img.style.width = `${spriteData.width}px`;
                img.style.height = `${spriteData.height}px`;
                img.style.objectPosition = `-${spriteData.x}px -${spriteData.y}px`;
                img.src = itemImage.src;
                img.style.transform = 'scale(0.5)'; // Scale down to fit
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

function updateCamera() {
    camera.x = gameState.localPlayer.x - canvas.width / 2 + TILE_SIZE / 2;
    camera.y = gameState.localPlayer.y - canvas.height / 2 + TILE_SIZE;
    
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

    let newX = player.x + player.vx;
    let newY = player.y + player.vy;
    player.onGround = false;
    
    // X-axis collision
    if (checkCollision(newX, player.y)) {
        newX = player.x;
        player.vx = 0;
    }
    
    // Y-axis collision
    if (checkCollision(newX, newY)) {
        if(player.vy > 0) {
            player.onGround = true;
            newY = Math.floor(newY / TILE_SIZE) * TILE_SIZE - (TILE_SIZE * 1.5);
        } else if(player.vy < 0) {
            newY = (Math.floor(player.y / TILE_SIZE)) * TILE_SIZE;
        }
        player.vy = 0;
    }

    player.x = newX;
    player.y = newY;
    
    if(player.y > (WORLD_HEIGHT) * TILE_SIZE) {
        respawnPlayer();
    }
}

function checkCollision(x, y) {
    const playerLeft = Math.floor(x / TILE_SIZE);
    const playerRight = Math.floor((x + TILE_SIZE - 1) / TILE_SIZE);
    const playerTop = Math.floor(y / TILE_SIZE);
    const playerBottom = Math.floor((y + TILE_SIZE * 1.5 - 1) / TILE_SIZE);

    for (let tx = playerLeft; tx <= playerRight; tx++) {
        for (let ty = playerTop; ty <= playerBottom; ty++) {
            if (isTileSolid(tx, ty)) {
                return true;
            }
        }
    }
    return false;
}

function isTileSolid(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return true;
    const tileId = gameState.worldData[x]?.[y] ?? 0;
    const tile = TILE_TYPES[tileId];
    return tile && tile.solid !== false;
}

function respawnPlayer() {
    const player = gameState.localPlayer;
    player.x = (WORLD_WIDTH / 2) * TILE_SIZE;
    player.y = (WORLD_HEIGHT / 2.5 - 10) * TILE_SIZE;
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
    
    const worldX = clickX + camera.x;
    const worldY = clickY + camera.y;
    
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    const selectedItem = gameState.localPlayer.hotbar[gameState.localPlayer.selectedHotbarSlot];
    if (selectedItem && ITEM_DATA[selectedItem.type]?.placeable) {
        placeBlock(tileX, tileY, ITEM_DATA[selectedItem.type].tileId, selectedItem.type);
    } else {
        breakBlock(tileX, tileY);
    }
}

async function breakBlock(x, y) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;
    const originalTileId = gameState.worldData[x]?.[y];
    if (!originalTileId) return;
    
    const blockToDrop = getDropFromTile(originalTileId);
    if (blockToDrop) {
         addToInventory(blockToDrop, 1);
    }
    gameState.worldData[x][y] = 0;

    if (gameState.worldId) {
        const worldRef = doc(db, `artifacts/${appId}/public/data/worlds`, gameState.worldId);
        const updatePath = `worldData.${x}.${y}`;
        await updateDoc(worldRef, { [updatePath]: 0 });
    }
}

async function placeBlock(x, y, tileId, itemType) {
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;
    if (gameState.worldData[x]?.[y] !== 0) return;

    if(!removeFromInventory(itemType, 1)) {
        return;
    }

    gameState.worldData[x][y] = tileId;

    if (gameState.worldId) {
        const worldRef = doc(db, `artifacts/${appId}/public/data/worlds`, gameState.worldId);
        const updatePath = `worldData.${x}.${y}`;
        await updateDoc(worldRef, { [updatePath]: tileId });
    }
}

function getDropFromTile(tileId) {
    switch(tileId) {
        case 1: case 2: return 'stone';
        case 3: return 'stone';
        case 4: return 'wood';
        case 5: return null; // Leaves drop nothing for now
        case 6: return 'sand';
        case 7: return 'wood'; // Cactus drops wood
        case 8: return 'coal';
        case 9: return 'iron_ore';
        case 10: return 'crafting_bench';
        case 11: return 'wood_planks';
        default: return null;
    }
}

// --- Inventory & Crafting Logic ---
function addToInventory(itemType, count) {
    const player = gameState.localPlayer;
    player.inventory[itemType] = (player.inventory[itemType] || 0) + count;
    updateHotbarFromInventory();
    updateInventoryScreen();
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
    const player = gameState.localPlayer;
    const invItems = Object.keys(player.inventory);
    for(let i=0; i < player.hotbar.length; i++) {
        const itemType = invItems[i];
        if (itemType) {
            player.hotbar[i] = { type: itemType, count: player.inventory[itemType] };
        } else {
            player.hotbar[i] = null;
        }
    }
    updateHUD();
}

// --- UI & Controls Setup ---
function setupControls() {
    window.addEventListener('keydown', (e) => {
        if(document.activeElement.tagName === 'INPUT') return;
        if(e.key.toLowerCase() === 'e') {
             toggleInventory();
             return;
        }
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
        actionBtn.addEventListener('touchstart', (e) => { e.preventDefault(); handleAction(e); });
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
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    }
}

function updateInventoryScreen() {
    if (!gameState.isInventoryOpen) return;
    const invGrid = document.getElementById('inventory-grid');
    invGrid.innerHTML = '';
    const slotsCount = 40; // 5x8 grid
    for(let i=0; i < slotsCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'hotbar-slot';
        invGrid.appendChild(slot);
    }
    Object.entries(gameState.localPlayer.inventory).forEach(([itemType, count], index) => {
         const slot = invGrid.children[index];
         if(slot) {
            const itemData = ITEM_DATA[itemType];
            const itemImage = assets.images.items;
            const spriteData = assets.sprites.items[itemData.sprite];
            if(itemImage && spriteData) {
                const img = document.createElement('img');
                img.style.objectFit = 'none';
                img.style.width = `${spriteData.width}px`;
                img.style.height = `${spriteData.height}px`;
                img.style.objectPosition = `-${spriteData.x}px -${spriteData.y}px`;
                img.src = itemImage.src;
                img.style.transform = 'scale(0.6)';
                slot.appendChild(img);
            }
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
        recipeEl.className = 'recipe';
        if(canCraft) recipeEl.classList.add('can-craft');

        const resultItemData = ITEM_DATA[itemType];
        const itemImage = assets.images.items;
        const resultSprite = assets.sprites.items[resultItemData.sprite];
        
        let reqText = Object.entries(recipeData.requires).map(([reqItem, reqCount]) => `${reqCount} ${ITEM_DATA[reqItem].name}`).join(', ');

        recipeEl.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="w-10 h-10 bg-gray-700 flex items-center justify-center" id="recipe-img-${itemType}"></div>
                <div>
                    <span>${resultItemData.name} x${recipeData.quantity}</span>
                    <br>
                    <small class="text-gray-400">${reqText}</small>
                </div>
            </div>
        `;
        
        if (canCraft) {
            recipeEl.onclick = () => craftItem(itemType, recipeData);
        }
        recipesEl.appendChild(recipeEl);
        
        // Add image to recipe listing
        if(itemImage && resultSprite){
            const imgContainer = document.getElementById(`recipe-img-${itemType}`);
            const img = document.createElement('img');
            img.style.objectFit = 'none';
            img.style.width = `${resultSprite.width}px`;
            img.style.height = `${resultSprite.height}px`;
            img.style.objectPosition = `-${resultSprite.x}px -${resultSprite.y}px`;
            img.src = itemImage.src;
            img.style.transform = 'scale(0.5)';
            imgContainer.appendChild(img);
        }
    }
}

function checkCanCraft(recipe) {
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
        const worldDataForFirestore = gameState.worldData.map(col => Object.assign({}, col));
        await setDoc(worldRef, { 
            createdAt: new Date().toISOString(),
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
        const playerRef = doc(db, `artifacts/${appId}/public/data/worlds/${gameState.worldId}/players`, userId);
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

    worldUnsubscribe = onSnapshot(worldRef, (docSnap) => {
        if(docSnap.exists()){
            const data = docSnap.data();
            const worldArray = [];
            if (data.worldData) {
                Object.keys(data.worldData).sort((a,b) => parseInt(a) - parseInt(b)).forEach(x => {
                    worldArray[parseInt(x)] = [];
                    Object.keys(data.worldData[x]).sort((a,b) => parseInt(a) - parseInt(b)).forEach(y => {
                        worldArray[parseInt(x)][parseInt(y)] = data.worldData[x][y];
                    });
                });
            }
            gameState.worldData = worldArray;
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
            const {x, y, vx, vy, onGround, ...serverState} = newPlayers[userId];
            Object.assign(gameState.localPlayer, serverState);
        }
        updateHUD();
    });
    
    resizeCanvas();
    setupControls();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

async function sendPlayerData() {
    if (!gameState.worldId || !userId) return;
    const playerRef = doc(db, `artifacts/${appId}/public/data/worlds/${gameState.worldId}/players`, userId);
    try {
        await updateDoc(playerRef, {
            x: gameState.localPlayer.x,
            y: gameState.localPlayer.y,
            health: gameState.localPlayer.health,
            inventory: gameState.localPlayer.inventory,
            hotbar: gameState.localPlayer.hotbar,
            selectedHotbarSlot: gameState.localPlayer.selectedHotbarSlot
        });
    } catch(e) {
        console.warn("Could not send player data:", e.message);
    }
}

async function exitToMenu() {
    if (worldUnsubscribe) worldUnsubscribe();
    if (playersUnsubscribe) playersUnsubscribe();
    worldUnsubscribe = playersUnsubscribe = null;

    if(gameState.worldId && userId) {
         const playerRef = doc(db, `artifacts/${appId}/public/data/worlds/${gameState.worldId}/players`, userId);
         await deleteDoc(playerRef).catch(e => console.error("Could not delete player doc", e));
    }

    gameState.worldId = null;
    gameState.isPaused = false;
    gameState.isInventoryOpen = false;
    mainMenu.classList.remove('hidden');
    gameContainer.classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('inventory-screen').classList.add('hidden');
}

function generateWorldCode() {
    const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
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

const parallaxHills = document.getElementById('parallax-hills');
const parallaxTrees = document.getElementById('parallax-trees');
mainMenu.addEventListener('mousemove', (e) => {
    const x = e.clientX / window.innerWidth - 0.5;
    parallaxHills.style.backgroundPositionX = -x * 30 + 'px';
    parallaxTrees.style.backgroundPositionX = -x * 60 + 'px';
});

// --- Initializer ---
window.onload = initializeFirebase;
