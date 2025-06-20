
export class AssetManager {
    constructor() {
        this.assets = {
            spritesheets: {},
            tiles: {},
            characters: {},
            items: {},
            particles: {},
            audio: {}
        };
        
        this.spriteData = {
            characters: null,
            items: null,
            tiles: null,
            particles: null
        };
        
        this.loadedAssets = 0;
        this.totalAssets = 0;
    }
    
    async loadAllAssets(progressCallback) {
        const assetPaths = {
            spritesheets: [
                'assets/Spritesheets/spritesheet_characters.png',
                'assets/Spritesheets/spritesheet_items.png',
                'assets/Spritesheets/spritesheet_tiles.png',
                'assets/Spritesheets/spritesheet_particles.png'
            ],
            spriteData: [
                'assets/Spritesheets/spritesheet_characters.xml',
                'assets/Spritesheets/spritesheet_items.xml',
                'assets/Spritesheets/spritesheet_tiles.xml',
                'assets/Spritesheets/spritesheet_particles.xml'
            ]
        };
        
        this.totalAssets = assetPaths.spritesheets.length + assetPaths.spriteData.length;
        
        // Load sprite data first
        await this.loadSpriteData(assetPaths.spriteData, progressCallback);
        
        // Load spritesheets
        await this.loadSpritesheets(assetPaths.spritesheets, progressCallback);
        
        // Extract individual sprites
        this.extractSprites();
        
        console.log('📦 All assets loaded:', this.assets);
    }
    
    async loadSpriteData(paths, progressCallback) {
        for (const path of paths) {
            try {
                const response = await fetch(path);
                const xmlText = await response.text();
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
                
                const filename = path.split('/').pop().replace('.xml', '');
                const category = filename.replace('spritesheet_', '');
                
                this.spriteData[category] = this.parseXMLSpriteData(xmlDoc);
                
                this.updateProgress(progressCallback, `Loaded ${filename} data`);
                
            } catch (error) {
                console.warn(`Failed to load sprite data: ${path}`, error);
                this.updateProgress(progressCallback, `Failed to load ${path}`);
            }
        }
    }
    
    async loadSpritesheets(paths, progressCallback) {
        for (const path of paths) {
            try {
                const img = await this.loadImage(path);
                const filename = path.split('/').pop().replace('.png', '');
                const category = filename.replace('spritesheet_', '');
                
                this.assets.spritesheets[category] = img;
                
                this.updateProgress(progressCallback, `Loaded ${filename}`);
                
            } catch (error) {
                console.warn(`Failed to load spritesheet: ${path}`, error);
                this.updateProgress(progressCallback, `Failed to load ${path}`);
            }
        }
    }
    
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
            img.src = src;
        });
    }
    
    parseXMLSpriteData(xmlDoc) {
        const sprites = {};
        const subTextures = xmlDoc.getElementsByTagName('SubTexture');
        
        for (const subTexture of subTextures) {
            const name = subTexture.getAttribute('name').replace('.png', '');
            sprites[name] = {
                x: parseInt(subTexture.getAttribute('x')),
                y: parseInt(subTexture.getAttribute('y')),
                width: parseInt(subTexture.getAttribute('width')),
                height: parseInt(subTexture.getAttribute('height'))
            };
        }
        
        return sprites;
    }
    
    extractSprites() {
        // Extract character sprites
        if (this.assets.spritesheets.characters && this.spriteData.characters) {
            this.extractSpritesFromSheet('characters', this.assets.spritesheets.characters, this.spriteData.characters);
        }
        
        // Extract item sprites
        if (this.assets.spritesheets.items && this.spriteData.items) {
            this.extractSpritesFromSheet('items', this.assets.spritesheets.items, this.spriteData.items);
        }
        
        // Extract tile sprites
        if (this.assets.spritesheets.tiles && this.spriteData.tiles) {
            this.extractSpritesFromSheet('tiles', this.assets.spritesheets.tiles, this.spriteData.tiles);
        }
        
        // Extract particle sprites
        if (this.assets.spritesheets.particles && this.spriteData.particles) {
            this.extractSpritesFromSheet('particles', this.assets.spritesheets.particles, this.spriteData.particles);
        }
    }
    
    extractSpritesFromSheet(category, spritesheet, spriteData) {
        if (!this.assets[category]) {
            this.assets[category] = {};
        }
        
        for (const spriteName in spriteData) {
            const sprite = spriteData[spriteName];
            
            // Create canvas for individual sprite
            const canvas = document.createElement('canvas');
            canvas.width = sprite.width;
            canvas.height = sprite.height;
            const ctx = canvas.getContext('2d');
            
            // Extract sprite from spritesheet
            ctx.drawImage(
                spritesheet,
                sprite.x, sprite.y, sprite.width, sprite.height,
                0, 0, sprite.width, sprite.height
            );
            
            this.assets[category][spriteName] = canvas;
        }
    }
    
    updateProgress(progressCallback, status) {
        this.loadedAssets++;
        const progress = (this.loadedAssets / this.totalAssets) * 100;
        if (progressCallback) {
            progressCallback(progress, status);
        }
    }
    
    getSprite(category, name) {
        return this.assets[category]?.[name] || null;
    }
    
    getTile(name) {
        return this.getSprite('tiles', name);
    }
    
    getCharacter(name) {
        return this.getSprite('characters', name);
    }
    
    getItem(name) {
        return this.getSprite('items', name);
    }
    
    getParticle(name) {
        return this.getSprite('particles', name);
    }
    
    // Create placeholder sprites for missing assets
    createPlaceholder(width = 32, height = 32, color = '#FF0000') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, width, height);
        
        return canvas;
    }
}
