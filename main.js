
import { GameEngine } from './js/GameEngine.js';
import { AssetManager } from './js/AssetManager.js';
import { NetworkManager } from './js/NetworkManager.js';
import { CharacterSelector } from './js/CharacterSelector.js';

class AcreGameLauncher {
    constructor() {
        this.gameEngine = null;
        this.assetManager = new AssetManager();
        this.networkManager = new NetworkManager();
        this.characterSelector = new CharacterSelector();
        this.currentScreen = 'loading';
        this.gameData = {
            worldCode: null,
            selectedCharacter: null,
            isHost: false
        };
        
        this.initializeElements();
        this.setupEventListeners();
    }
    
    initializeElements() {
        this.screens = {
            loading: document.getElementById('loading-screen'),
            characterSelect: document.getElementById('character-select-screen'),
            mainMenu: document.getElementById('main-menu'),
            game: document.getElementById('game-container'),
            joinModal: document.getElementById('join-world-modal'),
            pauseMenu: document.getElementById('pause-menu'),
            inventoryScreen: document.getElementById('inventory-screen')
        };
        
        this.elements = {
            loadingStatus: document.getElementById('loading-status'),
            startGameBtn: document.getElementById('start-game-btn'),
            hostBtn: document.getElementById('host-btn'),
            joinBtn: document.getElementById('join-btn'),
            worldCodeInput: document.getElementById('world-code-input'),
            joinConfirmBtn: document.getElementById('join-confirm-btn'),
            joinCancelBtn: document.getElementById('join-cancel-btn'),
            pauseBtn: document.getElementById('pause-btn'),
            resumeBtn: document.getElementById('resume-btn'),
            exitBtn: document.getElementById('exit-btn'),
            inventoryBtn: document.getElementById('inventory-btn'),
            closeInventoryBtn: document.getElementById('close-inventory-btn'),
            gameCanvas: document.getElementById('game-canvas'),
            pauseWorldCode: document.getElementById('pause-world-code')
        };
    }
    
    setupEventListeners() {
        // Character selection
        this.elements.startGameBtn?.addEventListener('click', () => this.startGame());
        
        // Main menu
        this.elements.hostBtn?.addEventListener('click', () => this.hostWorld());
        this.elements.joinBtn?.addEventListener('click', () => this.showJoinModal());
        
        // Join world modal
        this.elements.joinConfirmBtn?.addEventListener('click', () => this.joinWorld());
        this.elements.joinCancelBtn?.addEventListener('click', () => this.hideJoinModal());
        
        // Game controls
        this.elements.pauseBtn?.addEventListener('click', () => this.pauseGame());
        this.elements.resumeBtn?.addEventListener('click', () => this.resumeGame());
        this.elements.exitBtn?.addEventListener('click', () => this.exitToMenu());
        this.elements.inventoryBtn?.addEventListener('click', () => this.toggleInventory());
        this.elements.closeInventoryBtn?.addEventListener('click', () => this.closeInventory());
        
        // Mobile controls
        this.setupMobileControls();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => this.handleKeyDown(event));
    }
    
    setupMobileControls() {
        const isMobile = window.innerWidth < 768;
        const mobileControls = document.getElementById('mobile-controls');
        
        if (isMobile && mobileControls) {
            mobileControls.classList.remove('hidden');
            
            // D-pad controls
            document.getElementById('d-pad-left')?.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.gameEngine?.handleInput('left', true);
            });
            document.getElementById('d-pad-left')?.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.gameEngine?.handleInput('left', false);
            });
            
            document.getElementById('d-pad-right')?.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.gameEngine?.handleInput('right', true);
            });
            document.getElementById('d-pad-right')?.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.gameEngine?.handleInput('right', false);
            });
            
            // Action buttons
            document.getElementById('jump-button')?.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.gameEngine?.handleInput('jump', true);
            });
            
            document.getElementById('action-button')?.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.gameEngine?.handleInput('action', true);
            });
        }
    }
    
    async init() {
        try {
            console.log('🎮 Initializing Acre...');
            this.updateLoadingStatus('Loading assets...');
            
            // Load all game assets
            await this.assetManager.loadAllAssets((progress, status) => {
                this.updateLoadingStatus(status);
            });
            
            console.log('✅ Assets loaded successfully');
            this.updateLoadingStatus('Setting up character selection...');
            
            // Initialize character selector
            await this.characterSelector.init(this.assetManager);
            
            // Transition to character selection
            this.showScreen('characterSelect');
            
        } catch (error) {
            console.error('❌ Failed to initialize game:', error);
            this.updateLoadingStatus('Error loading game: ' + error.message);
        }
    }
    
    updateLoadingStatus(status) {
        if (this.elements.loadingStatus) {
            this.elements.loadingStatus.textContent = status;
        }
    }
    
    showScreen(screenName) {
        // Hide all screens
        Object.values(this.screens).forEach(screen => {
            if (screen) screen.classList.add('hidden');
        });
        
        // Show requested screen
        if (this.screens[screenName]) {
            this.screens[screenName].classList.remove('hidden');
        }
        
        this.currentScreen = screenName;
    }
    
    async startGame() {
        const selectedCharacter = this.characterSelector.getSelectedCharacter();
        if (!selectedCharacter) {
            alert('Please select a character first!');
            return;
        }
        
        this.gameData.selectedCharacter = selectedCharacter;
        this.showScreen('mainMenu');
    }
    
    async hostWorld() {
        try {
            this.updateLoadingStatus('Creating world...');
            this.showScreen('loading');
            
            // Generate world code
            this.gameData.worldCode = this.generateWorldCode();
            this.gameData.isHost = true;
            
            // Initialize game engine
            this.gameEngine = new GameEngine(this.assetManager, this.networkManager);
            await this.gameEngine.init({
                isHost: true,
                worldCode: this.gameData.worldCode,
                character: this.gameData.selectedCharacter
            });
            
            // Setup canvas
            this.setupCanvas();
            
            // Start game loop
            this.gameEngine.start();
            
            // Update pause menu with world code
            if (this.elements.pauseWorldCode) {
                this.elements.pauseWorldCode.textContent = this.gameData.worldCode;
            }
            
            this.showScreen('game');
            
        } catch (error) {
            console.error('❌ Failed to host world:', error);
            alert('Failed to create world: ' + error.message);
            this.showScreen('mainMenu');
        }
    }
    
    showJoinModal() {
        this.screens.joinModal.classList.remove('hidden');
    }
    
    hideJoinModal() {
        this.screens.joinModal.classList.add('hidden');
        if (this.elements.worldCodeInput) {
            this.elements.worldCodeInput.value = '';
        }
    }
    
    async joinWorld() {
        const worldCode = this.elements.worldCodeInput?.value.toUpperCase().trim();
        if (!worldCode || worldCode.length !== 6) {
            alert('Please enter a valid 6-character world code');
            return;
        }
        
        try {
            this.updateLoadingStatus('Joining world...');
            this.hideJoinModal();
            this.showScreen('loading');
            
            this.gameData.worldCode = worldCode;
            this.gameData.isHost = false;
            
            // Initialize game engine
            this.gameEngine = new GameEngine(this.assetManager, this.networkManager);
            await this.gameEngine.init({
                isHost: false,
                worldCode: this.gameData.worldCode,
                character: this.gameData.selectedCharacter
            });
            
            // Setup canvas
            this.setupCanvas();
            
            // Start game loop
            this.gameEngine.start();
            
            this.showScreen('game');
            
        } catch (error) {
            console.error('❌ Failed to join world:', error);
            alert('Failed to join world: ' + error.message);
            this.showScreen('mainMenu');
        }
    }
    
    setupCanvas() {
        const canvas = this.elements.gameCanvas;
        if (!canvas) return;
        
        // Set canvas size
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        
        // Handle resize
        window.addEventListener('resize', () => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            this.gameEngine?.handleResize();
        });
    }
    
    pauseGame() {
        if (this.gameEngine) {
            this.gameEngine.pause();
        }
        this.screens.pauseMenu.classList.remove('hidden');
    }
    
    resumeGame() {
        if (this.gameEngine) {
            this.gameEngine.resume();
        }
        this.screens.pauseMenu.classList.add('hidden');
    }
    
    exitToMenu() {
        if (this.gameEngine) {
            this.gameEngine.stop();
            this.gameEngine = null;
        }
        this.screens.pauseMenu.classList.add('hidden');
        this.showScreen('mainMenu');
    }
    
    toggleInventory() {
        const isVisible = !this.screens.inventoryScreen.classList.contains('hidden');
        if (isVisible) {
            this.closeInventory();
        } else {
            this.openInventory();
        }
    }
    
    openInventory() {
        this.screens.inventoryScreen.classList.remove('hidden');
        if (this.gameEngine) {
            this.gameEngine.updateInventoryDisplay();
        }
    }
    
    closeInventory() {
        this.screens.inventoryScreen.classList.add('hidden');
    }
    
    handleKeyDown(event) {
        switch (event.code) {
            case 'Escape':
                if (this.currentScreen === 'game') {
                    if (!this.screens.pauseMenu.classList.contains('hidden')) {
                        this.resumeGame();
                    } else if (!this.screens.inventoryScreen.classList.contains('hidden')) {
                        this.closeInventory();
                    } else {
                        this.pauseGame();
                    }
                }
                break;
            case 'KeyI':
            case 'Tab':
                if (this.currentScreen === 'game') {
                    event.preventDefault();
                    this.toggleInventory();
                }
                break;
        }
    }
    
    generateWorldCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}

// Initialize game when page loads
window.addEventListener('load', () => {
    const game = new AcreGameLauncher();
    game.init();
});

// Make game available globally for debugging
window.AcreGame = AcreGameLauncher;
