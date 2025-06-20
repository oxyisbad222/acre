
export class CharacterSelector {
    constructor() {
        this.characters = [
            { id: 'male', name: 'Human Male', parts: ['male_head', 'male_body', 'male_arm', 'male_leg'] },
            { id: 'female', name: 'Human Female', parts: ['female_head', 'female_body', 'female_arm', 'female_leg'] },
            { id: 'alien', name: 'Alien', parts: ['alien_head', 'alien_body', 'alien_arm', 'alien_leg'] },
            { id: 'skeleton', name: 'Skeleton', parts: ['skeleton_head', 'skeleton_body', 'skeleton_arm', 'skeleton_leg'] },
            { id: 'zombie', name: 'Zombie', parts: ['zombie_head', 'zombie_body', 'zombie_arm', 'zombie_leg'] },
            { id: 'gnome', name: 'Gnome', parts: ['gnome_head', 'gnome_body', 'gnome_arm', 'gnome_leg'] }
        ];
        
        this.selectedCharacter = null;
        this.assetManager = null;
    }
    
    async init(assetManager) {
        this.assetManager = assetManager;
        this.createCharacterGrid();
        this.selectCharacter('male'); // Default selection
    }
    
    createCharacterGrid() {
        const grid = document.getElementById('character-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        this.characters.forEach(character => {
            const option = document.createElement('div');
            option.className = 'character-option';
            option.dataset.characterId = character.id;
            
            const preview = document.createElement('div');
            preview.className = 'character-preview';
            
            // Create character composite
            this.createCharacterComposite(preview, character);
            
            const name = document.createElement('div');
            name.className = 'character-name text-center mt-2';
            name.textContent = character.name;
            
            option.appendChild(preview);
            option.appendChild(name);
            
            option.addEventListener('click', () => {
                this.selectCharacter(character.id);
            });
            
            grid.appendChild(option);
        });
    }
    
    createCharacterComposite(container, character) {
        // Create a canvas to composite the character parts
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        
        // Enable pixelated rendering
        ctx.imageSmoothingEnabled = false;
        
        // Draw character parts in order (back to front)
        const partOrder = ['body', 'arm', 'leg', 'head'];
        
        partOrder.forEach(partType => {
            const partName = character.parts.find(part => part.includes(partType));
            if (partName) {
                const sprite = this.assetManager.getCharacter(partName);
                if (sprite) {
                    // Scale and position parts
                    const scale = 2;
                    let offsetX = 0;
                    let offsetY = 0;
                    
                    // Adjust positioning based on part type
                    switch (partType) {
                        case 'head':
                            offsetY = -10;
                            break;
                        case 'body':
                            offsetY = 10;
                            break;
                        case 'arm':
                            offsetX = 20;
                            offsetY = 15;
                            break;
                        case 'leg':
                            offsetY = 40;
                            break;
                    }
                    
                    ctx.drawImage(
                        sprite,
                        (96 - sprite.width * scale) / 2 + offsetX,
                        (96 - sprite.height * scale) / 2 + offsetY,
                        sprite.width * scale,
                        sprite.height * scale
                    );
                }
            }
        });
        
        container.appendChild(canvas);
    }
    
    selectCharacter(characterId) {
        // Remove previous selection
        document.querySelectorAll('.character-option').forEach(option => {
            option.classList.remove('selected');
        });
        
        // Add selection to new character
        const option = document.querySelector(`[data-character-id="${characterId}"]`);
        if (option) {
            option.classList.add('selected');
        }
        
        this.selectedCharacter = this.characters.find(char => char.id === characterId);
        
        // Enable start button
        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.classList.remove('opacity-50');
        }
    }
    
    getSelectedCharacter() {
        return this.selectedCharacter;
    }
}
