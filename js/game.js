/**
 * JBCave - HTML5 Cave Flyer Game
 * Author: John Bonewitz
 */

// Game configuration
const CONFIG = {
    // API settings
    apiBaseUrl: '/jbcave/php', // Path to PHP files
    useServerFeatures: true,    // Set to false to use localStorage only

    // Game settings
    targetFPS: 60,             // Target frames per second
    particleCount: 50,         // Number of particles in explosion
    particleLifespan: 60,      // Frames that particles live
    
    // Cave settings
    defaultGravity: 0.25,
    defaultLift: 0.45,
    defaultMaxVelocity: 6,
    defaultObstacleFrequency: 150
};

// Get DOM elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score-display');
const gameOverScreen = document.getElementById('game-over');
const finalScoreDisplay = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');
const startBtn = document.getElementById('start-btn');

// Timing variables for consistent game speed
let lastTime = 0;
let deltaTime = 0;
const TIME_STEP = 1000 / CONFIG.targetFPS;

// Resize canvas to fit container
function resizeCanvas() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}

// Call resize on load and window resize
window.addEventListener('load', resizeCanvas);
window.addEventListener('resize', resizeCanvas);

// Game variables
let score = 0;
let gameSpeed = 3;
let gravity = CONFIG.defaultGravity;
let lift = -CONFIG.defaultLift;
let maxVelocity = CONFIG.defaultMaxVelocity;
let isGameOver = false;
let isThrusting = false;
let caveSections = [];
let obstacles = [];
let lastCaveY = 0;
let difficultyIncreaseInterval = 100;
let obstacleTimer = 0;
let highScore = 0;
let gameState = "menu";
let restartDelay = 0;

// Particle system for explosions
let particles = [];
const PARTICLE_GRAVITY = 0.1;
const PARTICLE_FRICTION = 0.98;

// High score variables
let globalHighScores = [];
let lastSubmittedScore = 0;

// Player variables
const player = {
    x: 150,
    y: 0, // Will be set based on canvas height
    width: 6,
    height: 6,
    velocity: 0,
    trailPositions: [],
    trailLength: 50
};

// Cave generation parameters
const caveParams = {
    minHeight: 100,
    maxHeight: 200,
    initialGap: 300,
    minGap: 100,
    narrowingRate: 0.1,
    sectionWidth: 50,
    roughness: 0.5,
    obstacleFrequency: CONFIG.defaultObstacleFrequency,
    obstacleWidth: 15,      
    obstacleHeight: 50,     
    maxObstacles: 5,        
    caveMinWidth: 3000
};

// Event for handling input state
function handleInput(isPressed) {
    isThrusting = isPressed;
}

// Variables to track input state
let keyIsDown = false;
let touchIsActive = false;

/**
 * Create explosion particles when player crashes
 */
function createExplosion(x, y) {
    particles = [];
    
    for (let i = 0; i < CONFIG.particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 5;
        const size = 2 + Math.random() * 4;
        const color = `hsl(${Math.random() * 30 + 200}, 100%, 60%)`;
        
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: size,
            color: color,
            alpha: 1,
            life: CONFIG.particleLifespan
        });
    }
}

/**
 * Update particle positions and properties
 */
function updateParticles(deltaFactor) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        
        // Apply gravity and friction
        p.vy += PARTICLE_GRAVITY * deltaFactor;
        p.vx *= PARTICLE_FRICTION;
        p.vy *= PARTICLE_FRICTION;
        
        // Update position
        p.x += p.vx * deltaFactor;
        p.y += p.vy * deltaFactor;
        
        // Update life and alpha
        p.life--;
        p.alpha = p.life / CONFIG.particleLifespan;
        
        // Remove dead particles
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

/**
 * Draw particles on the canvas
 */
function drawParticles() {
    for (const p of particles) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

/**
 * Initialize the game
 */
function init() {
    // Reset game variables
    score = 0;
    gameSpeed = 3;
    caveSections = [];
    obstacles = [];
    obstacleTimer = 0;
    particles = [];
    
    // Get values from sliders if game was started from menu
    if (gameState === "menu") {
        gravity = parseFloat(document.getElementById("gravity-slider").value);
        lift = -parseFloat(document.getElementById("lift-slider").value);
        maxVelocity = parseFloat(document.getElementById("speed-slider").value);
        caveParams.obstacleFrequency = parseInt(document.getElementById("obstacle-slider").value);
    }
    
    // Center player vertically
    player.y = canvas.height / 2;
    player.velocity = 0;
    player.trailPositions = [];
    
    // Generate initial cave
    initializeCave();
    
    // Hide menus
    document.getElementById("start-menu").style.display = "none";
    document.getElementById("game-over").style.display = "none";
    document.getElementById("high-score-input").style.display = "none";
    document.getElementById("score-display").style.display = "block";
    
    // Set game state
    gameState = "playing";
    isGameOver = false;
    
    // Start game loop if not already running
    if (!window.gameLoopRunning) {
        window.gameLoopRunning = true;
        requestAnimationFrame(gameLoop);
    }
}

/**
 * Generate the initial cave structure
 */
function initializeCave() {
    // Start with middle of the screen
    lastCaveY = canvas.height / 2;
    
    // Create enough sections to fill the screen plus some extra
    for (let x = 0; x < canvas.width + 400; x += caveParams.sectionWidth) {
        generateNextCaveSection(x);
    }
}

/**
 * Generate a new cave section
 */
function generateNextCaveSection(x) {
    // Calculate the current gap size based on score
    let currentGap = caveParams.initialGap;
    
    // Scale gap based on canvas height for mobile
    const scaleRatio = canvas.height / 500;
    currentGap = currentGap * scaleRatio;
    
    // Only narrow the cave until a certain score
    if (score < caveParams.caveMinWidth) {
        currentGap = Math.max(
            caveParams.minGap * scaleRatio, 
            currentGap - (score / difficultyIncreaseInterval * caveParams.narrowingRate * 10 * scaleRatio)
        );
    }
    
    // Create more pronounced meandering as the game progresses
    let meanderStrength = Math.min(40 * scaleRatio, score / 100);
    
    // Create randomness based on previous position
    const randomShift = (Math.random() * 2 - 1) * caveParams.roughness * meanderStrength;
    
    // Ensure the cave stays within the canvas bounds with some margin
    const margin = 50 * scaleRatio;
    const minY = margin + currentGap / 2;
    const maxY = canvas.height - margin - currentGap / 2;
    
    // Calculate new Y position with constraints
    let newY = lastCaveY + randomShift;
    newY = Math.max(minY, Math.min(newY, maxY));
    
    // Create the base cave section
    const section = {
        x: x,
        centerY: newY,
        gapHeight: currentGap
    };
    
    // Add to cave sections
    caveSections.push(section);
    
    // Update for next section
    lastCaveY = newY;
}

/**
 * Create a new obstacle
 */
function createObstacle() {
    if (obstacles.length >= caveParams.maxObstacles) return;
    
    // Find the last cave section
    const availableSections = caveSections.filter(s => s.x >= canvas.width);
    if (availableSections.length === 0) return;
    
    // Use a section that's just off-screen
    const section = availableSections[0];
    
    // Add slight random offset to obstacle position
    const offset = (Math.random() * 0.4 - 0.2) * section.gapHeight; 
    
    // Scale obstacle size based on canvas height
    const scaleRatio = canvas.height / 500;
    const obstacleHeight = caveParams.obstacleHeight * scaleRatio;
    const obstacleWidth = caveParams.obstacleWidth * scaleRatio;
    
    // Only create obstacle if there's enough space in the cave
    if (section.gapHeight > obstacleHeight * 1.5) {
        obstacles.push({
            x: section.x,
            y: section.centerY + offset - (obstacleHeight / 2),
            width: obstacleWidth,
            height: obstacleHeight
        });
    }
}

/**
 * Update game state
 */
function update(deltaFactor) {
    // If in menu state, do nothing
    if (gameState === "menu") {
        return;
    }
    
    // If game over, just update restart delay counter and particles
    if (gameState === "gameover") {
        restartDelay++;
        updateParticles(deltaFactor);
        return;
    }
    
    // Update player velocity based on input
    if (isThrusting) {
        player.velocity += lift * deltaFactor;
    } else {
        player.velocity += gravity * deltaFactor;
    }
    
    // Limit max velocity
    player.velocity = Math.max(-maxVelocity, Math.min(player.velocity, maxVelocity));
    
    // Update player position
    player.y += player.velocity * deltaFactor;
    
    // Add current position to trail
    player.trailPositions.unshift({x: player.x, y: player.y});
    
    // Update all previous trail positions by moving them left with game speed
    for (let i = 1; i < player.trailPositions.length; i++) {
        player.trailPositions[i].x -= gameSpeed * deltaFactor;
    }
    
    // Limit trail length
    if (player.trailPositions.length > player.trailLength || 
        (player.trailPositions.length > 0 && 
        player.trailPositions[player.trailPositions.length-1].x < -50)) {
        player.trailPositions.pop();
    }
    
    // Move cave sections
    for (let i = 0; i < caveSections.length; i++) {
        caveSections[i].x -= gameSpeed * deltaFactor;
    }
    
    // Move obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].x -= gameSpeed * deltaFactor;
        
        // Remove obstacles that are off-screen
        if (obstacles[i].x + obstacles[i].width < 0) {
            obstacles.splice(i, 1);
        }
    }
    
    // Remove off-screen sections and generate new ones
    if (caveSections[0].x <= -caveParams.sectionWidth) {
        caveSections.shift();
        
        // Figure out what x value to use for the new section
        const lastSectionX = caveSections[caveSections.length - 1].x;
        generateNextCaveSection(lastSectionX + caveParams.sectionWidth);
    }
    
    // Handle obstacle generation timing
    obstacleTimer += deltaFactor;
    const obstacleInterval = Math.max(80, caveParams.obstacleFrequency - Math.floor(score / 1000) * 10);
    
    if (obstacleTimer >= obstacleInterval && score > 300) {
        createObstacle();
        obstacleTimer = 0;
    }
    
    // Check for collisions
    checkCollisions();
    
    // Update score based on time rather than frames
    score += deltaFactor * 0.6;
    scoreDisplay.textContent = `Score: ${Math.floor(score)}`;
    
    // Increase difficulty gradually
    if (Math.floor(score) % difficultyIncreaseInterval === 0 && 
        Math.floor(score) > 0 && 
        Math.floor(score - deltaFactor) % difficultyIncreaseInterval !== 0) {
        
        // Increase speed up to a certain point
        if (gameSpeed < 7) {
            gameSpeed += 0.1;
        }
    }
    
    // Update any active particles
    updateParticles(deltaFactor);
}

/**
 * Check collisions with cave walls and obstacles
 */
function checkCollisions() {
    // Get player current position (front of the ribbon)
    const playerX = player.x;
    const playerY = player.y;
    const playerRadius = player.height / 2;
    
    // Find the cave sections that the player is currently passing through
    for (const section of caveSections) {
        if (playerX + playerRadius >= section.x && 
            playerX - playerRadius <= section.x + caveParams.sectionWidth) {
            
            // Check if player hits top or bottom wall
            const topWallBottom = section.centerY - (section.gapHeight / 2);
            const bottomWallTop = section.centerY + (section.gapHeight / 2);
            
            if (playerY - playerRadius <= topWallBottom || 
                playerY + playerRadius >= bottomWallTop) {
                createExplosion(playerX, playerY);
                gameOver();
                return;
            }
        }
    }
    
    // Check for collision with obstacles
    for (const obstacle of obstacles) {
        if (playerX + playerRadius >= obstacle.x && 
            playerX - playerRadius <= obstacle.x + obstacle.width && 
            playerY + playerRadius >= obstacle.y && 
            playerY - playerRadius <= obstacle.y + obstacle.height) {
            createExplosion(playerX, playerY);
            gameOver();
            return;
        }
    }
    
    // Check if player hits the canvas edges
    if (playerY - playerRadius <= 0 || 
        playerY + playerRadius >= canvas.height) {
        createExplosion(playerX, playerY);
        gameOver();
    }
}

/**
 * Game over
 */
function gameOver() {
    isGameOver = true;
    gameState = "gameover";
    score = Math.floor(score); // Round the final score down to an integer
    
    // Update high score if needed
    if (score > highScore) {
        highScore = score;
        // Try to save high score to localStorage
        try {
            localStorage.setItem('jbcave-highscore', highScore.toString());
            document.getElementById('menu-high-score').textContent = `High Score: ${highScore}`;
        } catch (e) {
            console.log('Could not save high score');
        }
    }
    
    // Save personal scores to localStorage
    try {
        let personalScores = JSON.parse(localStorage.getItem('jbcave-scores') || '[]');
        personalScores.push(Math.floor(score)); // Ensure it's an integer
        personalScores.sort((a, b) => b - a); // Sort in descending order
        if (personalScores.length > 10) personalScores = personalScores.slice(0, 10); // Keep top 10
        localStorage.setItem('jbcave-scores', JSON.stringify(personalScores));
    } catch (e) {
        console.log('Could not save personal scores');
    }
    
    // Always prompt for name to submit score if over 100
    if (score > 100 && score !== lastSubmittedScore && CONFIG.useServerFeatures) {
        // Show high score input after a short delay to see explosion
        setTimeout(() => {
            document.getElementById('high-score-value').textContent = `Your score: ${Math.floor(score)}`;
            document.getElementById('high-score-input').style.display = 'flex';
            document.getElementById('name-input').style.display = 'none';
            document.getElementById('activate-input-btn').style.display = 'block';
        }, 1000);
        return; // Don't show game over screen yet
    }
    
    // Show game over screen
    finalScoreDisplay.textContent = `Your score: ${Math.floor(score)}`;
    document.getElementById("high-score-display").textContent = `High score: ${highScore}`;
    gameOverScreen.style.display = 'flex';
    
    // Reset restart delay
    restartDelay = 0;
}

/**
 * Draw game elements
 */
function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Only draw the game itself if not in menu state
    if (gameState !== "menu") {
        // Draw cave
        drawCave();
        
        // Draw obstacles
        drawObstacles();
        
        // Draw player trail (which is now the only visual for the player)
        drawPlayerTrail();
        
        // Draw particles
        drawParticles();
    }
}

/**
 * Draw the cave walls
 */
function drawCave() {
    // Draw upper and lower walls with meandering path as score increases
    for (const section of caveSections) {
        if (section.x > canvas.width) continue;
        
        ctx.fillStyle = '#282';
        
        // Top wall
        ctx.fillRect(
            section.x, 
            0, 
            caveParams.sectionWidth, 
            section.centerY - (section.gapHeight / 2)
        );
        
        // Bottom wall
        ctx.fillRect(
            section.x, 
            section.centerY + (section.gapHeight / 2), 
            caveParams.sectionWidth, 
            canvas.height - (section.centerY + (section.gapHeight / 2))
        );
    }
}

/**
 * Draw obstacles
 */
function drawObstacles() {
    for (const obstacle of obstacles) {
        // Draw the obstacle with a bright color and border
        ctx.fillStyle = '#f44';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }
}

/**
 * Draw player's trail as a flowing ribbon
 */
function drawPlayerTrail() {
    if (player.trailPositions.length < 2) return;
    
    ctx.strokeStyle = '#39c';
    ctx.lineWidth = player.height;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(player.trailPositions[0].x, player.trailPositions[0].y);
    
    for (let i = 1; i < player.trailPositions.length; i++) {
        ctx.lineTo(player.trailPositions[i].x, player.trailPositions[i].y);
    }
    
    ctx.stroke();
}

// ------------------------------
// High Score Functions
// ------------------------------

/**
 * Display personal scores from localStorage
 */
function displayPersonalScores() {
    try {
        const personalScores = JSON.parse(localStorage.getItem('jbcave-scores') || '[]');
        const leaderboardEl = document.getElementById('personal-leaderboard');
        
        if (personalScores.length === 0) {
            leaderboardEl.innerHTML = '<div class="loading">No personal scores yet</div>';
            return;
        }
        
        let tableHtml = `
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Score</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        personalScores.slice(0, 5).forEach((score, index) => {
            tableHtml += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${score}</td>
                </tr>
            `;
        });
        
        tableHtml += `
                </tbody>
            </table>
        `;
        
        leaderboardEl.innerHTML = tableHtml;
    } catch (e) {
        console.log('Could not display personal scores', e);
    }
}

/**
 * Display global high scores
 */
function displayGlobalHighScores() {
    const leaderboardEl = document.getElementById('global-leaderboard');
    
    if (globalHighScores.length === 0) {
        leaderboardEl.innerHTML = '<div class="loading">No global scores yet. Be the first!</div>';
        return;
    }
    
    let tableHtml = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Score</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    globalHighScores.slice(0, 5).forEach((scoreData, index) => {
        tableHtml += `
            <tr>
                <td>${index + 1}</td>
                <td>${scoreData.player_name}</td>
                <td>${scoreData.score}</td>
            </tr>
        `;
    });
    
    tableHtml += `
            </tbody>
        </table>
    `;
    
    leaderboardEl.innerHTML = tableHtml;
}

/**
 * Switch between personal and global leaderboard tabs
 */
function switchLeaderboardTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Show the selected leaderboard
    document.querySelectorAll('.leaderboard-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById(`${tabName}-leaderboard`).style.display = 'block';
}

/**
 * Fetch high scores from the server
 */
function fetchHighScores() {
    // Display personal scores
    displayPersonalScores();
    
    // Check if server features are disabled
    if (!CONFIG.useServerFeatures) {
        document.getElementById('global-tab').classList.add('disabled');
        document.getElementById('global-leaderboard').innerHTML = 
            '<div class="loading">Server features disabled - using local storage only</div>';
        return;
    }
    
    // Fetch global scores
    const leaderboardEl = document.getElementById('global-leaderboard');
    leaderboardEl.innerHTML = '<div class="loading">Loading scores...</div>';
    
    fetch(`${CONFIG.apiBaseUrl}/get_scores.php?limit=10`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.success && data.scores) {
                globalHighScores = data.scores;
                displayGlobalHighScores();
            } else {
                throw new Error(data.message || 'Invalid data format');
            }
        })
        .catch(error => {
            console.error('Error fetching high scores:', error);
            leaderboardEl.innerHTML = '<div class="loading">Could not load scores. Using local storage only.</div>';
        });
}

/**
 * Submit a high score to the server
 */
function submitHighScore() {
    const nameInput = document.getElementById('name-input');
    const playerName = nameInput.value.trim();
    
    if (!playerName) {
        alert('Please enter your name!');
        return;
    }
    
    // Disable the submit button to prevent double submission
    document.getElementById('submit-score-btn').disabled = true;
    
    fetch(`${CONFIG.apiBaseUrl}/submit_score.php`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: playerName,
            score: Math.floor(score)
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Record that we've submitted this score
            lastSubmittedScore = score;
            
            // Hide high score input
            document.getElementById('high-score-input').style.display = 'none';
            
            // Show game over screen
            finalScoreDisplay.textContent = `Your score: ${score}`;
            document.getElementById("high-score-display").textContent = `High score: ${highScore}`;
            gameOverScreen.style.display = 'flex';
            
            // Refresh high scores in the background
            fetchHighScores();
        } else {
            throw new Error(data.message || 'Score submission failed');
        }
    })
    .catch(error => {
        console.error('Error submitting score:', error);
        alert('Could not submit your score. Please try again.');
        
        // Re-enable the submit button
        document.getElementById('submit-score-btn').disabled = false;
    });
}

/**
 * Game loop with consistent timing
 */
function gameLoop(timestamp) {
    // Calculate delta time
    if (!lastTime) {
        lastTime = timestamp;
    }
    
    deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    
    // Calculate the factor to scale movements by
    // This ensures consistent speed regardless of frame rate
    const deltaFactor = deltaTime / TIME_STEP;
    
    update(deltaFactor);
    draw();
    
    // Continue game loop
    requestAnimationFrame(gameLoop);
}

/**
 * Show main menu
 */
function showMainMenu() {
    gameState = "menu";
    document.getElementById('start-menu').style.display = 'flex';
    document.getElementById('score-display').style.display = 'none';
    document.getElementById('high-score-input').style.display = 'none';
    document.getElementById('menu-high-score').textContent = `High Score: ${highScore}`;
    
    // Show all main menu items and hide settings
    document.querySelectorAll('.main-menu-item').forEach(item => {
        item.style.display = '';
    });
    document.getElementById('settings-panel').style.display = 'none';
    document.getElementById('settings-btn').textContent = 'Game Settings';
    
    // Fetch current high scores
    fetchHighScores();
    
    // Reset game elements
    caveSections = [];
    obstacles = [];
    particles = [];
    player.trailPositions = [];
}

/**
 * Toggle settings panel visibility
 */
function toggleSettings() {
    const settingsPanel = document.getElementById('settings-panel');
    const mainMenuItems = document.querySelectorAll('.main-menu-item');
    
    if (settingsPanel.style.display === 'flex') {
        // Show main menu items
        mainMenuItems.forEach(item => {
            item.style.display = '';
        });
        settingsPanel.style.display = 'none';
        document.getElementById('settings-btn').textContent = 'Game Settings';
    } else {
        // Hide main menu items
        mainMenuItems.forEach(item => {
            item.style.display = 'none';
        });
        settingsPanel.style.display = 'flex';
        document.getElementById('settings-btn').textContent = 'Game Settings';
    }
}

/**
 * Setup High Score Event Listeners
 */
function setupHighScoreEventListeners() {
    // Activate input button (to prevent keyboard from popping up automatically)
    document.getElementById('activate-input-btn').addEventListener('click', function() {
        this.style.display = 'none';
        document.getElementById('name-input').style.display = 'block';
        document.getElementById('name-input').focus();
    });
    
    // Submit score button
    document.getElementById('submit-score-btn').addEventListener('click', submitHighScore);
    
    // Skip submit button
    document.getElementById('skip-submit-btn').addEventListener('click', () => {
        document.getElementById('high-score-input').style.display = 'none';
        
        // Show game over screen
        finalScoreDisplay.textContent = `Your score: ${Math.floor(score)}`;
        document.getElementById("high-score-display").textContent = `High score: ${highScore}`;
        gameOverScreen.style.display = 'flex';
    });
    
    // Allow Enter key to submit score when input is focused
    document.getElementById('name-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitHighScore();
        }
    });
    
    // Settings back button
    document.getElementById('settings-back-btn').addEventListener('click', toggleSettings);
}

/**
 * Handle user input events
 */
function setupEventListeners() {
    // Touch events for the game (mobile)
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent scrolling
        touchIsActive = true;
        handleInput(true);
    });
    
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        touchIsActive = false;
        handleInput(false);
    });
    
    canvas.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        touchIsActive = false;
        handleInput(false);
    });
    
    // Mouse events (desktop)
    canvas.addEventListener('mousedown', () => {
        if (!touchIsActive) handleInput(true);
    });
    
    canvas.addEventListener('mouseup', () => {
        if (!touchIsActive) handleInput(false);
    });
    
    canvas.addEventListener('mouseleave', () => {
        if (!touchIsActive) handleInput(false);
    });
    
    // Key events
    window.addEventListener('keydown', (e) => {
        if ((e.key === ' ' || e.key === 'ArrowUp')) {
            // Prevent scrolling when using space/arrow keys
            e.preventDefault();
            
            // For gameplay
            if (gameState === "playing" && !keyIsDown) {
                keyIsDown = true;
                handleInput(true);
            }
            // For game restart with delay
            else if (gameState === "gameover" && restartDelay >= 30) {
                gameOverScreen.style.display = 'none';
                init();
            }
            // For game start from menu
            else if (gameState === "menu") {
                init();
            }
        }
        
        // Allow Enter key to restart game
        if (e.key === 'Enter' && gameState === "gameover") {
            gameOverScreen.style.display = 'none';
            init();
        }
    });
    
    window.addEventListener('keyup', (e) => {
        if (e.key === ' ' || e.key === 'ArrowUp') {
            keyIsDown = false;
            handleInput(false);
        }
    });
    
    // Prevent keyboard repeat issues
    window.addEventListener('blur', () => {
        keyIsDown = false;
        handleInput(false);
    });
    
    // Game over screen buttons
    document.getElementById('restart-btn').addEventListener('click', () => {
        gameOverScreen.style.display = 'none';
        init();
    });
    
    document.getElementById('menu-btn').addEventListener('click', () => {
        gameOverScreen.style.display = 'none';
        showMainMenu();
    });
    
    // Main menu buttons
    document.getElementById('start-btn').addEventListener('click', () => {
        init();
    });
    
    document.getElementById('settings-btn').addEventListener('click', toggleSettings);
    
    // Slider event listeners
    document.getElementById('gravity-slider').addEventListener('input', (e) => {
        document.getElementById('gravity-value').textContent = e.target.value;
    });
    
    document.getElementById('lift-slider').addEventListener('input', (e) => {
        document.getElementById('lift-value').textContent = e.target.value;
    });
    
    document.getElementById('speed-slider').addEventListener('input', (e) => {
        document.getElementById('speed-value').textContent = e.target.value;
    });
    
    document.getElementById('obstacle-slider').addEventListener('input', (e) => {
        document.getElementById('obstacle-value').textContent = e.target.value;
    });
    
    // Setup high score event listeners
    setupHighScoreEventListeners();
    
    // Tab switching for leaderboards
    document.getElementById('personal-tab').addEventListener('click', () => switchLeaderboardTab('personal'));
    document.getElementById('global-tab').addEventListener('click', () => switchLeaderboardTab('global'));
    
    // Prevent default touch behavior for the entire game container
    document.getElementById('game-container').addEventListener('touchmove', (e) => {
        e.preventDefault();
    }, { passive: false });
}

/**
 * Initialize the application
 */
function initApp() {
    // Try to load high score from localStorage
    try {
        const savedHighScore = localStorage.getItem('jbcave-highscore');
        if (savedHighScore) {
            highScore = parseInt(savedHighScore);
        }
    } catch (e) {
        console.log('Could not load high score');
    }
    
    // Update high score displays
    document.getElementById('menu-high-score').textContent = `High Score: ${highScore}`;
    
    // Set initial game state
    gameState = "menu";
    
    // Fix for the black screen on initial load
    document.getElementById('start-menu').style.display = 'flex';
    
    // Make sure score display is hidden initially
    document.getElementById('score-display').style.display = 'none';
    
    // Hide settings panel initially
    document.getElementById('settings-panel').style.display = 'none';
    
    // Setup all event listeners
    setupEventListeners();
    
    // Fetch high scores
    fetchHighScores();
    
    // Start game loop
    window.gameLoopRunning = true;
    requestAnimationFrame(gameLoop);
}

// Start the application when window loads
window.addEventListener('load', initApp);