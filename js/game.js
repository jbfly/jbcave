/**
 * JBCave - HTML5 Cave Flyer Game
 * Author: John Bonewitz
 */

// Game configuration
const CONFIG = (function () {
    // Detect if we're in local development
    const isLocalDev = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

    return {
        // API settings - dynamically adjust based on environment
        apiBaseUrl: isLocalDev ? 'php' : '/jbcave/php',
        useServerFeatures: true,    // Always enable for testing

        // Game settings (unchanged)
        targetFPS: 60,
        particleCount: 50,
        particleLifespan: 60,

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
})();

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

/**
 * Enhanced resize handling to ensure proper game dimensions on orientation change
 */
function resizeCanvas() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Recalculate player position and trail
    if (player) {
        // Keep player at a relative position when screen size changes
        player.x = Math.min(150, canvas.width * 0.2);

        // Adjust trail length based on new width
        player.trailLength = Math.max(50, Math.ceil(canvas.width / 6));

        // Clear trail positions if game is not in progress
        if (gameState !== "playing") {
            player.trailPositions = [];
        }
    }

    // Redraw if not in active gameplay
    if (gameState !== "playing") {
        draw();
    }
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
let inputBlocked = false;
let personalBestBeaten = false;
let globalHighScoreBeaten = false;
let personalBest = 0;
let globalBest = 0;
let beatenGlobalScores = []; // Track which global scores we've already shown notifications for
let isPaused = false;
let countdownActive = false;


// Particle system for explosions
let particles = [];
const PARTICLE_GRAVITY = 0.1;
const PARTICLE_FRICTION = 0.98;

// High score variables
let globalHighScores = [];
let lastSubmittedScore = 0;


/**
 * Generate verification token for score submission
 * This makes it harder to submit fake scores
 */
function generateScoreToken(playerName, score, gameStats) {
    // Create a string with game data that's hard to fake
    const timestamp = Date.now();
    
    // Game stats that would be hard to fake without actually playing
    const statsStr = [
        gameStats.playTime,           // How long they played (in ms)
        gameStats.jumps,              // Number of jumps/thrusts
        gameStats.obstacles,          // Number of obstacles passed 
        gameStats.distanceTraveled    // Total distance traveled
    ].join(':');
    
    // Create hash-like string from player data + stats
    // This isn't cryptographically secure, but adds a layer of complexity for cheaters
    let token = '';
    const dataString = `${playerName}:${score}:${statsStr}:${timestamp}`;
    
    // Simple "hash" algorithm (not secure, but better than nothing)
    for (let i = 0; i < dataString.length; i++) {
        token += (dataString.charCodeAt(i) ^ (score % 255)).toString(16);
    }
    
    return {
        token: token,
        timestamp: timestamp,
        stats: statsStr
    };
}
// Track gameplay statistics for verification
let gameStats = {
    playTime: 0,         // Time spent playing in ms
    startTime: 0,        // When the game started
    jumps: 0,            // Number of thrusts/jumps
    obstacles: 0,        // Number of obstacles passed
    distanceTraveled: 0  // Distance traveled
};

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

/**
 * Toggle pause state
 */
function togglePause() {
    if (gameState !== "playing") return; // Only allow pausing during active gameplay

    if (isPaused) {
        // Start countdown before unpausing
        startUnpauseCountdown();
    } else {
        // Pause the game immediately
        pauseGame();
    }
}

/**
 * Pause the game
 */
function pauseGame() {
    isPaused = true;

    // Update score display in pause menu
    document.getElementById('pause-score').textContent = `Score: ${Math.floor(score)}`;

    // Show pause menu
    document.getElementById('pause-menu').style.display = 'flex';
}

/**
 * Start countdown and then unpause
 */
function startUnpauseCountdown() {
    if (countdownActive) return; // Prevent multiple countdowns

    countdownActive = true;
    const countdownContainer = document.getElementById('countdown-container');
    const countdownElement = document.getElementById('countdown');

    // Hide pause menu buttons during countdown
    document.querySelectorAll('#pause-menu .button-container button').forEach(btn => {
        btn.style.display = 'none';
    });

    // Show countdown
    countdownContainer.style.display = 'flex';

    // Start at 3
    let count = 3;
    countdownElement.textContent = count;

    // Update countdown every second
    const countdownInterval = setInterval(() => {
        count--;

        if (count > 0) {
            countdownElement.textContent = count;
        } else {
            // End countdown and unpause
            clearInterval(countdownInterval);
            unpauseGame();

            // Reset UI elements
            countdownContainer.style.display = 'none';
            document.querySelectorAll('#pause-menu .button-container button').forEach(btn => {
                btn.style.display = 'block';
            });

            countdownActive = false;
        }
    }, 1000);
}

/**
 * Unpause the game
 */
function unpauseGame() {
    isPaused = false;
    document.getElementById('pause-menu').style.display = 'none';
}
/**
 * Setup pause control event listeners
 */
function setupPauseControls() {
    // Keyboard pause controls
    window.addEventListener('keydown', (e) => {
        if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && gameState === "playing") {
            togglePause();
        }
    });

    // Pause menu button controls
    document.getElementById('resume-btn').addEventListener('click', togglePause);
    document.getElementById('restart-from-pause-btn').addEventListener('click', () => {
        unpauseGame();
        init(); // Restart the game
    });
    document.getElementById('menu-from-pause-btn').addEventListener('click', () => {
        unpauseGame();
        showMainMenu();
    });
}

/**
 * Show a "hacker console" when a score is flagged
 * Add this function to your game.js file
 */
function showHackerConsole(debugInfo) {
    // Create hacker console element if it doesn't exist
    let hackerConsole = document.getElementById('hacker-console');
    if (!hackerConsole) {
        hackerConsole = document.createElement('div');
        hackerConsole.id = 'hacker-console';
        document.getElementById('game-container').appendChild(hackerConsole);
        
        // Add some CSS
        const style = document.createElement('style');
        style.textContent = `
            #hacker-console {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: #000;
                color: #0f0;
                font-family: monospace;
                padding: 20px;
                border: 2px solid #0f0;
                z-index: 1000;
                width: 90%;
                max-width: 500px;
                max-height: 80vh;
                overflow: auto;
                box-shadow: 0 0 20px #0f0;
                animation: glitch 0.3s infinite;
            }
            #hacker-console h2 {
                color: #f00;
                text-align: center;
                margin-top: 0;
            }
            #hacker-console p {
                margin: 5px 0;
                line-height: 1.4;
            }
            #hacker-console .key {
                color: #f00;
            }
            #hacker-console .value {
                color: #0f0;
            }
            #hacker-console .hint {
                color: #ff0;
                margin-top: 15px;
                border-top: 1px solid #ff0;
                padding-top: 10px;
            }
            #hacker-console button {
                background: #0f0;
                color: #000;
                border: none;
                padding: 8px 15px;
                margin-top: 15px;
                cursor: pointer;
                font-family: monospace;
                font-weight: bold;
                display: block;
                width: 100%;
            }
            @keyframes glitch {
                0% { text-shadow: 1px 0 0 #f00, -1px 0 0 #0f0; }
                50% { text-shadow: -1px 0 0 #f00, 1px 0 0 #0f0; }
                100% { text-shadow: 1px 0 0 #f00, -1px 0 0 #0f0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Format debug info
    let consoleHTML = `
        <h2>FLAGGED SUBMISSION DETECTED</h2>
        <p>Your submission was flagged as suspicious. Here's why:</p>
        <p><span class="key">Flag Reason:</span> <span class="value">${debugInfo.flagReason || 'Unknown'}</span></p>
        <p><span class="key">IP Address:</span> <span class="value">${debugInfo.ip || 'Unknown'}</span></p>
        <p><span class="key">Timestamp:</span> <span class="value">${new Date(debugInfo.timestamp * 1000).toLocaleString()}</span></p>
        <p><span class="key">Security Level:</span> <span class="value">${debugInfo.difficulty || 'Basic'}</span></p>
        <p class="hint"><span class="key">HINT:</span> <span class="value">${debugInfo.hint || 'Try harder!'}</span></p>
        <button id="close-hacker-console">ACKNOWLEDGE</button>
    `;
    
    // Set content and show
    hackerConsole.innerHTML = consoleHTML;
    hackerConsole.style.display = 'block';
    
    // Add close button listener
    document.getElementById('close-hacker-console').addEventListener('click', () => {
        hackerConsole.style.display = 'none';
        
        // Show game over screen
        document.getElementById('high-score-input').style.display = 'none';
        finalScoreDisplay.textContent = `Your score: ${Math.floor(score)}`;
        document.getElementById("high-score-display").textContent = `High score: ${highScore}`;
        gameOverScreen.style.display = 'flex';
        
        // Refresh scores
        fetchHighScores();
    });
}

/**
 * Validates the player's score to prevent tampering
 * This security measure ensures leaderboard integrity
 */
function validateScoreWithKey(score, playerName) {
    // We use a secret key to validate scores
    // TODO: Move this to server-side in the next update
    const secretKey = "jbcave-verification-1337";
    
    // Generate validation hash from score and player name
    const validationString = score + secretKey + playerName;
    let hashValue = 0;
    
    // Standard hashing algorithm
    for (let i = 0; i < validationString.length; i++) {
        hashValue = ((hashValue << 5) - hashValue) + validationString.charCodeAt(i);
        hashValue |= 0; // Convert to 32bit integer
    }
    
    // Store validation in local storage for verification
    // When submitting, we'll check if this matches server calculation
    localStorage.setItem('scoreValidation', btoa(hashValue.toString()));
    
    return btoa(hashValue.toString());
}
// Security cookie initialization
function initSecurityCookies() {
    // Set cookie expiration
    const d = new Date();
    d.setTime(d.getTime() + (7*24*60*60*1000));
    const expires = "expires="+ d.toUTCString();
    
    // Store security level
    document.cookie = "jbcave_security=level1; " + expires + "; path=/";
    
    // This cookie validates the user session
    document.cookie = "jbcave_validation=" + btoa("standard_user") + "; " + expires + "; path=/";
}
// Check for administrative privileges
function checkAdminAccess() {
    // Verify admin status  
    if (localStorage.getItem('isAdmin') === 'true') {
        document.getElementById('admin-panel').style.display = 'block';
        
        // Set up admin controls
        document.getElementById('admin-set-score').addEventListener('click', () => {
            score = 9999;
            console.log("Score set to 9999");
        });
        
        document.getElementById('admin-clear-obstacles').addEventListener('click', () => {
            obstacles = [];
            console.log("Obstacles cleared");
        });
    }
}
/**
 * Initialize high score comparison values - call this during initApp()
 */
function initHighScoreComparison() {
    // Get personal best from localStorage
    try {
        personalBest = parseInt(localStorage.getItem('jbcave-highscore') || '0');
    } catch (e) {
        personalBest = 0;
    }

    // Default global best to 0, will be updated when we fetch scores
    globalBest = 0;
}
/**
 * Check if player has surpassed any global high scores
 */
function checkGlobalRankAchievements(currentScore) {
    // Only process if we have global scores and server features are enabled
    if (!CONFIG.useServerFeatures || globalHighScores.length === 0) return;

    // Go through each global score from bottom to top (to get the easiest ones first)
    for (let i = globalHighScores.length - 1; i >= 0; i--) {
        const scoreEntry = globalHighScores[i];

        // Create a unique key for this score entry
        const scoreKey = `${scoreEntry.player_name}_${scoreEntry.score}`;

        // Skip if we've already shown notification for this entry
        if (beatenGlobalScores.includes(scoreKey)) continue;

        // Check if player's score just surpassed this score
        if (currentScore > scoreEntry.score) {
            // Mark as beaten
            beatenGlobalScores.push(scoreKey);

            // Show notification
            const rank = i + 1;
            showAchievement(`You Beat #${rank} - ${scoreEntry.player_name} - ${scoreEntry.score}`, 'rank');

            // We only show one notification at a time to avoid spam
            // So we break after finding the first one
            break;
        }
    }
}

function initSecurityCheck() {
    // Security validation - ensures client isn't modified
    // This feature prevents cheating by validating the game state
    fetch(`${CONFIG.apiBaseUrl}/security_check.php`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            // Format: timestamp-secretHash
            securityToken: Date.now() + "-" + "predictablevalue",
            clientData: {
                isModified: false,
                cheatDetected: false,
                timestamp: Date.now()
            }
        })
    }).catch(error => {
        // Silently fail - we don't want to block gameplay if server is down
        console.log("Security check complete");
    });
}

// Hidden developer tools for game testing
function checkDeveloperMode() {
    console.log("Checking developer mode...");
    console.log("URL params:", window.location.search);
    
    // Debug the current state
    console.log("Current devHash:", localStorage.getItem('devHash'));
    console.log("Expected devHash:", btoa('jbcavedev'));
    
    // Check URL for developer access
    if (window.location.search.includes('dev=true')) {
        console.log("Dev parameter detected in URL");
        
        if (localStorage.getItem('devHash') === btoa('jbcavedev')) {
            console.log("%c🔓 DEVELOPER MODE ACTIVATED! 🔓", "color: lime; font-size: 20px; font-weight: bold; background: black; padding: 5px;");
            
            // Add a visible indicator to the game
            const devIndicator = document.createElement('div');
            devIndicator.id = 'dev-mode-indicator';
            devIndicator.style.position = 'fixed';
            devIndicator.style.top = '10px';
            devIndicator.style.right = '10px';
            devIndicator.style.background = 'rgba(0,255,0,0.8)';
            devIndicator.style.color = 'black';
            devIndicator.style.padding = '5px 10px';
            devIndicator.style.borderRadius = '5px';
            devIndicator.style.fontWeight = 'bold';
            devIndicator.style.zIndex = '9999';
            devIndicator.textContent = 'DEV MODE';
            document.body.appendChild(devIndicator);
            
            // Add some developer powers
            window.devPowers = {
                setScore: function(value) {
                    score = value;
                    console.log(`Score set to ${value}`);
                },
                godMode: function() {
                    console.log("God mode activated - you are invincible!");
                    // Override the checkCollisions function to never detect collisions
                    window.originalCheckCollisions = checkCollisions;
                    checkCollisions = function() { return false; };
                },
                disableGodMode: function() {
                    console.log("God mode deactivated");
                    checkCollisions = window.originalCheckCollisions;
                }
            };
            
            console.log("%c🎮 Developer commands available:", "color: yellow; font-size: 14px;");
            console.log("%c   window.devPowers.setScore(9999)", "color: white; font-size: 12px;");
            console.log("%c   window.devPowers.godMode()", "color: white; font-size: 12px;");
            
            return true;
        } else {
            console.log("%c🔒 Developer mode requires authentication", "color: red; font-size: 14px;");
            console.log("Hint: Try setting the correct devHash in localStorage");
        }
    }
    return false;
}

/**
 * Format a date string to a human-readable format including time
 * @param {string} dateString - ISO date string from database
 * @returns {string} Formatted date with time
 */
function formatDate(dateString) {
    const date = new Date(dateString);

    // Format date: "Mar 9, 2025"
    const dateOptions = {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    };

    // Format time: "3:45 PM"
    const timeOptions = {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };

    const formattedDate = date.toLocaleDateString(undefined, dateOptions);
    const formattedTime = date.toLocaleTimeString(undefined, timeOptions);

    return `${formattedDate} at ${formattedTime}`;
}

/**
 * Calculate and format time elapsed since date
 * @param {string} dateString - ISO date string from database
 * @returns {string} Human-readable time elapsed (e.g., "5m ago", "2d ago")
 */
function timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    // Less than a minute
    if (seconds < 60) {
        return "just now";
    }

    // Less than an hour
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }

    // Less than a day
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }

    // Less than a week
    const days = Math.floor(hours / 24);
    if (days < 7) {
        return `${days}d ago`;
    }

    // Less than a month
    if (days < 30) {
        const weeks = Math.floor(days / 7);
        return `${weeks}w ago`;
    }

    // Less than a year
    const months = Math.floor(days / 30);
    if (months < 12) {
        return `${months}mo ago`;
    }

    // More than a year
    const years = Math.floor(days / 365);
    return `${years}y ago`;
}

// Event for handling input state
// Modify your input handling to track jumps
function handleInput(isPressed) {
    // If the player just started pressing (and wasn't before)
    if (isPressed && !isThrusting) {
        gameStats.jumps++;
    }
    
    // Update thruster state
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
    lastSubmittedScore = 0; // Reset the last submitted score
    // Reset high score achievement flags
    personalBestBeaten = false;
    globalHighScoreBeaten = false;
    beatenGlobalScores = []; // Reset beaten global scores tracking
    
    function initStats() {
        gameStats = {
            playTime: 0,
            startTime: Date.now(),
            jumps: 0,
            obstacles: 0,
            distanceTraveled: 0
        };
    }
    // Call initStats() at the beginning of your init() function
    initStats();

    // Make sure personalBest is up to date when starting a new game
    initHighScoreComparison();

    // Set up security environment
    initSecurityCookies();
    // Initialize administrative features
    checkAdminAccess();
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

    // Position player x-coordinate relative to screen width
    player.x = Math.min(150, canvas.width * 0.2);

    // Clear and initialize the trail to extend across the screen
    player.trailPositions = [];

    // Calculate trail length based on screen width
    player.trailLength = Math.max(50, Math.ceil(canvas.width / 6));

    // Pre-populate trail to extend to left edge
    const trailStartX = -50; // Start trail beyond the left edge
    const trailEndX = player.x;
    const trailDistance = trailEndX - trailStartX;
    const numPoints = 20; // Number of initial trail points

    // Generate initial trail points from left edge to player position
    for (let i = 0; i < numPoints; i++) {
        const x = trailStartX + (trailDistance * i / (numPoints - 1));
        player.trailPositions.push({
            x: x,
            y: player.y
        });
    }

    console.log("%c🔒 Anti-cheat system initialized", "color: blue; font-size: 12px;");
    
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
    // Initialize development environment
    checkDeveloperMode();
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
 * Update score display with high score achievement effects
 * Call this in your update function where you update the score display
 */
function updateScoreDisplay() {
    // Get score display element
    const scoreElement = document.getElementById('score-display');

    // Calculate current score (floored to integer)
    const currentScore = Math.floor(score);

    // Check for high score achievements
    if (!personalBestBeaten && currentScore > personalBest) {
        // First time beating personal best
        personalBestBeaten = true;

        // Apply personal best effect
        scoreElement.classList.add('personal-best');

        // Create achievement notification
        showAchievement('New Personal Best!', 'personal');

        // Remove effect after a while
        setTimeout(() => {
            scoreElement.classList.remove('personal-best');
        }, 5000);
    }

    // Check for global high score achievement
    if (!globalHighScoreBeaten && globalBest > 0 && currentScore > globalBest) {
        // First time beating global high score
        globalHighScoreBeaten = true;

        // Apply global best effect
        scoreElement.classList.remove('personal-best');
        scoreElement.classList.add('global-best');

        // Create achievement notification
        showAchievement('New Global High Score!', 'global');

        // Keep effect until end of game
    }

    // Update the score display text
    scoreElement.textContent = `Score: ${currentScore}`;
}

/**
 * Check if a score qualifies for the personal top scores
 */
function isPersonalHighScore(playerScore) {
    try {
        let personalScores = JSON.parse(localStorage.getItem('jbcave-scores') || '[]');

        // If there are fewer than 10 personal scores, any score qualifies
        if (personalScores.length < 10) return true;

        // Otherwise, check if the score is higher than the lowest personal score
        const lowestScore = Math.min(...personalScores);
        return playerScore > lowestScore;
    } catch (e) {
        console.log('Error checking personal high score', e);
        return false;
    }
}

/**
 * Show achievement notification with type-specific durations
 */
function showAchievement(message, type) {
    // Check if notification element already exists
    let notification = document.getElementById('achievement-notification');

    // Create if it doesn't exist
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'achievement-notification';
        document.getElementById('game-container').appendChild(notification);
    }

    // Set content and apply appropriate class
    notification.textContent = message;
    notification.className = `achievement ${type}-achievement`;

    // Show notification
    notification.style.display = 'block';

    // Animate it
    notification.classList.add('show-achievement');

    // Use shorter duration for rank achievements
    const displayDuration = type === 'rank' ? 1500 : 3000;

    // Hide after duration
    setTimeout(() => {
        notification.classList.remove('show-achievement');
        setTimeout(() => {
            notification.style.display = 'none';
        }, 500);
    }, displayDuration);
}

/**
 * Update game state
 */
function update(deltaFactor) {
    // If in menu state, do nothing

    if (gameState === "menu") {
        return;
    }
    // If game is paused, do nothing (add this check)
    if (isPaused) {
        return;
    }
    // If game over, just update restart delay counter and particles
    if (gameState === "gameover") {
        restartDelay++;
        updateParticles(deltaFactor);
        return;
    }

    function updateStats(deltaFactor) {
        // Update game statistics
        gameStats.playTime = Date.now() - gameStats.startTime;
        gameStats.distanceTraveled += gameSpeed * deltaFactor;
        
        // Check if we've passed an obstacle
        for (let i = 0; i < obstacles.length; i++) {
            if (player.x > obstacles[i].x + obstacles[i].width && 
                obstacles[i].counted !== true) {
                gameStats.obstacles++;
                obstacles[i].counted = true;
            }
        }
    }

    // Call updateStats(deltaFactor) in your update() function
    updateStats(deltaFactor);

    // Update player velocity based on input
    if (isThrusting) {
        player.velocity += lift * deltaFactor;
    } else {
        player.velocity += gravity * deltaFactor;
    }

    if (Math.random() < 0.001) { // Very rare check
        console.log("%c🔍 Running periodic security validation...", "color: blue; font-size: 10px;");
        initSecurityCheck();
    }

    // Limit max velocity
    player.velocity = Math.max(-maxVelocity, Math.min(player.velocity, maxVelocity));

    // Update player position
    player.y += player.velocity * deltaFactor;

    // Add current position to trail
    player.trailPositions.unshift({ x: player.x, y: player.y });

    // Update all previous trail positions by moving them left with game speed
    for (let i = 1; i < player.trailPositions.length; i++) {
        player.trailPositions[i].x -= gameSpeed * deltaFactor;
    }

    // Maintain dynamic trail length based on screen size
    const minTrailLength = Math.ceil(canvas.width / 6);
    player.trailLength = Math.max(50, minTrailLength);

    // Only limit trail length if it's gotten too long
    // Make sure the trail extends beyond the left edge of the screen
    if (player.trailPositions.length > player.trailLength) {
        const lastPos = player.trailPositions[player.trailPositions.length - 1];
        // Only remove if it's well off-screen
        if (lastPos.x < -50) {
            player.trailPositions.pop();
        }
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
    updateScoreDisplay();
    checkGlobalRankAchievements(Math.floor(score));// Check for global rank achievements
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
 * Update showHighScoreInput to take qualification flags
 */
function showHighScoreInput(qualifiesForGlobal, qualifiesForPersonal) {
    // Clear the name input field
    document.getElementById('name-input').value = '';

    // Clear any previous status message
    let statusMsg = document.getElementById('submit-status-message');
    if (statusMsg) {
        statusMsg.textContent = '';
        statusMsg.className = 'status-message';
    }

    // Re-enable the submit button if it was disabled
    document.getElementById('submit-score-btn').disabled = false;

    // Set the score value
    document.getElementById('high-score-value').textContent = `Your score: ${Math.floor(score)}`;

    // Handle different cases for high score messaging
    if (qualifiesForGlobal) {
        // Check if it's actually the #1 score
        const isTopScore = globalHighScores.length === 0 || score > globalHighScores[0].score;

        if (isTopScore) {
            // Add a class to highlight the screen for the #1 score
            document.getElementById('high-score-input').classList.add('global-high-score');
            document.getElementById('high-score-input').classList.remove('leaderboard-score');

            // Update the heading to show it's the #1 global high score
            const heading = document.getElementById('high-score-input').querySelector('h2');
            heading.textContent = "New Global High Score!";
        } else {
            // Add a different class for leaderboard qualification
            document.getElementById('high-score-input').classList.add('leaderboard-score');
            document.getElementById('high-score-input').classList.remove('global-high-score');

            // Update the heading for leaderboard qualification
            const heading = document.getElementById('high-score-input').querySelector('h2');
            heading.textContent = "Leaderboard Worthy Score!";
        }

        // Make the submit button more prominent in both cases
        document.getElementById('submit-score-btn').classList.add('highlight-btn');
    } else if (qualifiesForPersonal) {
        // Personal best only
        document.getElementById('high-score-input').classList.remove('global-high-score');
        document.getElementById('high-score-input').classList.remove('leaderboard-score');
        document.getElementById('high-score-input').classList.add('personal-best-score');

        // Update heading
        const heading = document.getElementById('high-score-input').querySelector('h2');
        heading.textContent = "Personal Best Score!";

        // Normal submit button
        document.getElementById('submit-score-btn').classList.remove('highlight-btn');
    } else {
        // Should not happen with the updated logic, but just in case
        document.getElementById('high-score-input').classList.remove('global-high-score');
        document.getElementById('high-score-input').classList.remove('leaderboard-score');
        document.getElementById('high-score-input').classList.remove('personal-best-score');

        const heading = document.getElementById('high-score-input').querySelector('h2');
        heading.textContent = "New Score";

        document.getElementById('submit-score-btn').classList.remove('highlight-btn');
    }

    // Show the screen
    document.getElementById('high-score-input').style.display = 'flex';
    document.getElementById('name-input').style.display = 'none';
    document.getElementById('activate-input-btn').style.display = 'block';
}
/**
 * Modify gameOver function to only show high score input for qualifying scores
 */
function gameOver() {
    isGameOver = true;
    gameState = "gameover";
    inputBlocked = true; // Block input immediately
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
        let personalDates = JSON.parse(localStorage.getItem('jbcave-score-dates') || '[]');

        // Add current score
        personalScores.push(Math.floor(score));

        // Add current date
        const now = new Date().toISOString();
        personalDates.push(now);

        // Sort scores and maintain date alignment
        // Create array of [score, date] pairs, sort, then separate
        const combined = personalScores.map((score, i) => [score, personalDates[i] || null]);
        combined.sort((a, b) => b[0] - a[0]); // Sort by score descending

        // Keep only top 10
        const top10 = combined.slice(0, 10);

        // Split back into separate arrays
        personalScores = top10.map(item => item[0]);
        personalDates = top10.map(item => item[1]);

        // Save back to localStorage
        localStorage.setItem('jbcave-scores', JSON.stringify(personalScores));
        localStorage.setItem('jbcave-score-dates', JSON.stringify(personalDates));
    } catch (e) {
        console.log('Could not save personal scores', e);
    }

    // Check if score is high enough to prompt for name entry
    const qualifiesForGlobal = CONFIG.useServerFeatures && isGlobalHighScore(score);
    const qualifiesForPersonal = isPersonalHighScore(score);

    // Only show high score input if the score qualifies for either leaderboard
    // and is over 100 and hasn't been submitted yet
    if (score > 100 && score !== lastSubmittedScore && (qualifiesForGlobal || qualifiesForPersonal)) {
        // Show high score input after a short delay to see explosion
        setTimeout(() => {
            showHighScoreInput(qualifiesForGlobal, qualifiesForPersonal);
            // Unblock input after screen is shown
            setTimeout(() => {
                inputBlocked = false;
            }, 300);
        }, 1000);
        return; // Don't show game over screen yet
    }

    // Show game over screen
    finalScoreDisplay.textContent = `Your score: ${Math.floor(score)}`;
    document.getElementById("high-score-display").textContent = `High score: ${highScore}`;
    gameOverScreen.style.display = 'flex';

    // Reset restart delay
    restartDelay = 0;

    // Unblock input after a short delay to ensure the screen is visible
    setTimeout(() => {
        inputBlocked = false;
    }, 300);
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
 * Update the drawPlayerTrail function to ensure complete rendering
 */
function drawPlayerTrail() {
    if (player.trailPositions.length < 2) return;

    ctx.strokeStyle = '#39c';
    ctx.lineWidth = player.height;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Add smooth alpha gradient for trail
    const gradient = ctx.createLinearGradient(
        player.trailPositions[player.trailPositions.length - 1].x, 0,
        player.trailPositions[0].x, 0
    );
    gradient.addColorStop(0, 'rgba(51, 153, 204, 0.3)'); // Fade at the end
    gradient.addColorStop(0.5, 'rgba(51, 153, 204, 0.7)');
    gradient.addColorStop(1, 'rgba(51, 153, 204, 1)'); // Full opacity at player

    ctx.strokeStyle = gradient;

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
 * Display personal scores from localStorage with dates
 */
/**
 * Display personal scores from localStorage with expand/collapse functionality
 */
function displayPersonalScores() {
    try {
        const personalScores = JSON.parse(localStorage.getItem('jbcave-scores') || '[]');
        const personalDates = JSON.parse(localStorage.getItem('jbcave-score-dates') || '[]');
        const leaderboardEl = document.getElementById('personal-leaderboard');

        if (personalScores.length === 0) {
            leaderboardEl.innerHTML = '<div class="loading">No personal scores yet</div>';
            return;
        }

        // Initial display count and max display count
        const initialCount = 5;
        const maxCount = 10; // Show up to 10 personal scores when expanded

        let tableHtml = `
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Score</th>
                        <th>When</th>
                    </tr>
                </thead>
                <tbody class="initial-scores">
        `;

        // Combine scores with dates if available
        const scoresWithDates = personalScores.map((score, index) => {
            return {
                score: score,
                date: personalDates[index] || null
            };
        });

        // Add initial scores (always visible)
        scoresWithDates.slice(0, initialCount).forEach((item, index) => {
            const timeAgoText = item.date ? timeAgo(item.date) : "";
            const dateTooltip = item.date ? formatDate(item.date) : "";

            tableHtml += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${item.score}</td>
                    <td class="score-date" title="${dateTooltip}">${timeAgoText}</td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
                <tbody class="extra-scores" style="display: none;">
        `;

        // Add extra scores (initially hidden)
        if (scoresWithDates.length > initialCount) {
            scoresWithDates.slice(initialCount, maxCount).forEach((item, index) => {
                const timeAgoText = item.date ? timeAgo(item.date) : "";
                const dateTooltip = item.date ? formatDate(item.date) : "";

                tableHtml += `
                    <tr>
                        <td>${index + initialCount + 1}</td>
                        <td>${item.score}</td>
                        <td class="score-date" title="${dateTooltip}">${timeAgoText}</td>
                    </tr>
                `;
            });
        }

        tableHtml += `
                </tbody>
            </table>
        `;

        // Add toggle button if there are more scores
        if (scoresWithDates.length > initialCount) {
            tableHtml += `
                <div class="toggle-scores-container">
                    <button class="toggle-scores-btn" data-target="personal">Show More</button>
                </div>
            `;
        }

        leaderboardEl.innerHTML = tableHtml;

        // Add event listener to the toggle button
        const toggleBtn = leaderboardEl.querySelector('.toggle-scores-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', toggleScores);
        }
    } catch (e) {
        console.log('Could not display personal scores', e);
    }
}


/**
 * Display global high scores with expand/collapse functionality
 */
function displayGlobalHighScores() {
    const leaderboardEl = document.getElementById('global-leaderboard');

    if (globalHighScores.length === 0) {
        leaderboardEl.innerHTML = '<div class="loading">No global scores yet. Be the first!</div>';
        return;
    }

    // Initial display count and max display count
    const initialCount = 5;
    const maxCount = 15; // Show up to 15 scores when expanded

    let tableHtml = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Score</th>
                    <th>When</th>
                </tr>
            </thead>
            <tbody class="initial-scores">
    `;

    // Add initial scores (always visible)
    globalHighScores.slice(0, initialCount).forEach((scoreData, index) => {
        const timeAgoText = scoreData.date_added ? timeAgo(scoreData.date_added) : "";
        const dateTooltip = scoreData.date_added ? formatDate(scoreData.date_added) : "";

        tableHtml += `
            <tr>
                <td>${index + 1}</td>
                <td>${scoreData.player_name}</td>
                <td>${scoreData.score}</td>
                <td class="score-date" title="${dateTooltip}">${timeAgoText}</td>
            </tr>
        `;
    });

    tableHtml += `
            </tbody>
            <tbody class="extra-scores" style="display: none;">
    `;

    // Add extra scores (initially hidden)
    if (globalHighScores.length > initialCount) {
        globalHighScores.slice(initialCount, maxCount).forEach((scoreData, index) => {
            const timeAgoText = scoreData.date_added ? timeAgo(scoreData.date_added) : "";
            const dateTooltip = scoreData.date_added ? formatDate(scoreData.date_added) : "";

            tableHtml += `
                <tr>
                    <td>${index + initialCount + 1}</td>
                    <td>${scoreData.player_name}</td>
                    <td>${scoreData.score}</td>
                    <td class="score-date" title="${dateTooltip}">${timeAgoText}</td>
                </tr>
            `;
        });
    }

    tableHtml += `
            </tbody>
        </table>
    `;

    // Add toggle button if there are more scores
    if (globalHighScores.length > initialCount) {
        tableHtml += `
            <div class="toggle-scores-container">
                <button class="toggle-scores-btn" data-target="global">Show More</button>
            </div>
        `;
    }

    leaderboardEl.innerHTML = tableHtml;

    // Add event listener to the toggle button
    const toggleBtn = leaderboardEl.querySelector('.toggle-scores-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleScores);
    }
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
 * Toggle between showing more/less scores
 */
function toggleScores(e) {
    const button = e.target;
    const target = button.getAttribute('data-target');
    const container = document.getElementById(`${target}-leaderboard`);
    const extraScores = container.querySelector('.extra-scores');

    if (extraScores.style.display === 'none') {
        // Show more scores
        extraScores.style.display = 'table-row-group';
        button.textContent = 'Show Less';
    } else {
        // Show fewer scores
        extraScores.style.display = 'none';
        button.textContent = 'Show More';
    }
}

/**
 * Fetch high scores from the server
 */
// Update the fetchHighScores function to show global scores by default
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

    fetch(`${CONFIG.apiBaseUrl}/get_scores.php?limit=15`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.success && data.scores) {
                globalHighScores = data.scores;
                if (globalHighScores.length > 0) {
                    // Global best will be the highest score
                    globalBest = globalHighScores[0].score;
                }
                displayGlobalHighScores();

                // Show global scores by default
                switchLeaderboardTab('global');
            } else {
                throw new Error(data.message || 'Invalid data format');
            }
        })
        .catch(error => {
            console.error('Error fetching high scores:', error);
            leaderboardEl.innerHTML = '<div class="loading">Could not load scores. Using local storage only.</div>';

            // Show personal scores as fallback
            switchLeaderboardTab('personal');
        });
}

/**
 * Check if a score is good enough for the global leaderboard
 */
function isGlobalHighScore(playerScore) {
    // If there are no global scores yet, any score is worthy
    if (globalHighScores.length === 0) return true;

    // If there are fewer than 10 scores, any score is worthy
    if (globalHighScores.length < 10) return true;

    // Otherwise, check if the score is higher than the lowest score on the board
    const lowestScore = Math.min(...globalHighScores.map(entry => entry.score));
    return playerScore > lowestScore;
}

/**
 * Update the submitHighScore function to fix state management
 */
// Modify submitHighScore to include token
function submitHighScore() {
    const nameInput = document.getElementById('name-input');
    const playerName = nameInput.value.trim();
    const submitBtn = document.getElementById('submit-score-btn');
    const currentScore = Math.floor(score); // Store the current score for comparison
    
    // Generate validation token to prevent score manipulation
    const validationToken = validateScoreWithKey(currentScore, playerName);

    // Add a status message element if it doesn't exist
    let statusMsg = document.getElementById('submit-status-message');
    if (!statusMsg) {
        statusMsg = document.createElement('div');
        statusMsg.id = 'submit-status-message';
        statusMsg.className = 'status-message';
        document.getElementById('name-input-container').appendChild(statusMsg);
    }
    
    if (!playerName) {
        statusMsg.textContent = 'Please enter your name!';
        statusMsg.className = 'status-message error';
        return;
    }
    
    // Show submitting status
    statusMsg.textContent = 'Submitting score...';
    statusMsg.className = 'status-message info';
    
    // Disable the submit button to prevent double submission
    submitBtn.disabled = true;
    
    // Generate verification token
    const verificationData = generateScoreToken(playerName, currentScore, gameStats);
    
    // Data to submit
    const submitData = {
        name: playerName,
        score: currentScore,
        token: verificationData.token,
        timestamp: verificationData.timestamp,
        stats: verificationData.stats,
        validation: validationToken
    };
    
    fetch(`${CONFIG.apiBaseUrl}/submit_score.php`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData)
    })
    .then(response => {
        // Log the raw response for debugging
        console.log('Server response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        // Log the parsed response data
        console.log('Server response data:', data);
        /**
        * Handle flagged scores with a special message
        * Add this inside the submitHighScore function, in the .then() block
        * where you handle the response data
        */
        if (data.success) {
            // Record that we've submitted this specific score
            lastSubmittedScore = currentScore;
            
            // Check if the score was flagged
            if (data.status === 'flagged') {
                // Show special message for flagged scores
                statusMsg.textContent = data.message || 'Score flagged for review';
                statusMsg.className = 'status-message warning';
                
                // Show "hacker console" with debug info
                showHackerConsole(data.debug);
            } else {
                // Normal success flow
                statusMsg.textContent = 'Score submitted successfully!';
                statusMsg.className = 'status-message success';
                
                // Hide high score input after a short delay
                setTimeout(() => {
                    document.getElementById('high-score-input').style.display = 'none';
                    
                    // Show game over screen
                    finalScoreDisplay.textContent = `Your score: ${currentScore}`;
                    document.getElementById("high-score-display").textContent = `High score: ${highScore}`;
                    gameOverScreen.style.display = 'flex';
                    
                    // Refresh high scores to include the new submission
                    setTimeout(() => {
                        fetchHighScores();
                    }, 500);
                }, 1000);
            }
        } else {
            throw new Error(data.message || 'Score submission failed');
        }
    })
    .catch(error => {
        console.error('Error submitting score:', error);
        
        // Show error message to user
        statusMsg.textContent = 'Error submitting score. Please try again.';
        statusMsg.className = 'status-message error';
        
        // Re-enable the submit button
        submitBtn.disabled = false;
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
    document.getElementById('activate-input-btn').addEventListener('click', function () {
        this.style.display = 'none';
        document.getElementById('name-input').style.display = 'block';
        document.getElementById('name-input').focus();
    });

    // Submit score button
    document.getElementById('submit-score-btn').addEventListener('click', submitHighScore);

    // Skip submit button with confirmation for potential high scores
    document.getElementById('skip-submit-btn').addEventListener('click', () => {
        // If server features are enabled and this is a potential high score, ask for confirmation
        if (CONFIG.useServerFeatures && isGlobalHighScore(score)) {
            const confirmSkip = confirm("You have a potential global high score! Are you sure you don't want to submit it?");
            if (!confirmSkip) {
                return; // Don't skip if they cancel
            }
        }

        // If confirmed or not a high score, proceed with skip
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

        // Skip input handling if input is blocked
        if (inputBlocked) return;

        touchIsActive = true;

        if (gameState === "playing") {
            handleInput(true);
        } else if (gameState === "gameover" && restartDelay >= 30) {
            gameOverScreen.style.display = 'none';
            init();
        } else if (gameState === "menu") {
            init();
        }
    });

    window.addEventListener('orientationchange', function () {
        // Small delay to let the browser update dimensions
        setTimeout(function () {
            resizeCanvas();

            // Force redraw of menu
            if (gameState === "menu") {
                // Refresh the display of scores to fit new dimensions
                displayPersonalScores();
                displayGlobalHighScores();
            }
        }, 200);
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
        // Skip input handling if input is blocked or touch is active
        if (inputBlocked || touchIsActive) return;

        if (gameState === "playing") {
            handleInput(true);
        } else if (gameState === "gameover" && restartDelay >= 30) {
            gameOverScreen.style.display = 'none';
            init();
        } else if (gameState === "menu") {
            init();
        }
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

            // Skip input handling if input is blocked
            if (inputBlocked) return;

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
        if (e.key === 'Enter' && gameState === "gameover" && !inputBlocked && restartDelay >= 30) {
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

function setupHelpMenu() {
    // Help button
    document.getElementById('help-btn').addEventListener('click', () => {
        document.getElementById('help-overlay').style.display = 'flex';
    });

    // Close help button
    document.getElementById('help-close-btn').addEventListener('click', () => {
        document.getElementById('help-overlay').style.display = 'none';
    });
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

    // Initialize high score comparison variables
    initHighScoreComparison();

    // Update high score displays
    document.getElementById('menu-high-score').textContent = `My High Score: ${highScore}`;

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
    // Setup help menu
    setupHelpMenu();
    // Fetch high scores
    fetchHighScores();
    setupPauseControls();
    // Start game loop
    window.gameLoopRunning = true;
    requestAnimationFrame(gameLoop);
}

// Start the application when window loads
window.addEventListener('load', initApp);