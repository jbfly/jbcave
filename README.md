# JBCave

A fun HTML5 cave flyer game inspired by SFCave, with high scores and mobile support.

## Play Online

You can play the game at: https://bonewitz.net/jbcave/

## Features

- Smooth gameplay on both desktop and mobile devices
- Particle effects for crashes
- Local and global high score tracking
- Fully responsive design
- Time-based animation for consistent gameplay across devices
- Mobile-friendly controls and interface

## Project Structure

```
jbcave/
├── css/              # Stylesheet files
│   └── style.css     # Main game styles
├── js/               # JavaScript files
│   └── game.js       # Game logic and rendering
├── php/              # Server-side code for high scores
│   ├── config.template.php  # Database configuration template
│   ├── get_scores.php       # API to fetch high scores
│   └── submit_score.php     # API to submit new scores
├── index.html        # Main game HTML
└── README.md         # This file
```

## Local Development

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/jbfly/jbcave.git
   cd jbcave
   ```

2. If you want database features (global high scores):
   - Copy `php/config.template.php` to `php/config.php`
   - Update database credentials in `config.php`
   - Create the required MySQL/MariaDB table (see Database Setup below)

3. Start a local web server in the project directory:
   ```bash
   # Using PHP's built-in server (if PHP is installed)
   php -S localhost:8000
   
   # OR using Python 3
   python3 -m http.server 8000
   
   # OR using Python 2
   python -m SimpleHTTPServer 8000
   ```

4. Open your browser to http://localhost:8000

### Database Setup

The global high score feature requires a MySQL/MariaDB database with the following structure:

```sql
CREATE DATABASE jbcave_db;
USE jbcave_db;

CREATE TABLE jbcave_highscores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_name VARCHAR(20) NOT NULL,
    score INT NOT NULL,
    date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create a dedicated user for the game (replace 'your_password' with a secure password)
CREATE USER 'jbcave_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON jbcave_db.* TO 'jbcave_user'@'localhost';
FLUSH PRIVILEGES;
```

## Configuration

The game can be configured by editing the `CONFIG` object at the top of `js/game.js`:

```javascript
const CONFIG = {
    // API settings
    apiBaseUrl: '/jbcave/php', // Path to PHP files 
    useServerFeatures: true,    // Set to false to use localStorage only

    // Game settings
    targetFPS: 60,
    // ... other settings
};
```

Set `useServerFeatures` to `false` to disable database features and use only localStorage for high scores. This allows the game to be used without setting up a database.

## Deployment Workflow

This section describes how to set up a GitHub-based deployment workflow for the game.

### Initial Server Setup

1. SSH into your server:
   ```bash
   ssh jbfly@bonewitz.net
   ```

2. Back up existing files if needed:
   ```bash
   cd /srv/http/jbcave
   cp -r . ../jbcave-backup-$(date +%Y%m%d)
   ```

3. Install Git on your server if not already present:
   ```bash
   # For Arch Linux
   sudo pacman -S git
   ```

4. Clone the repository to your web directory:
   ```bash
   cd /srv/http
   mv jbcave jbcave-old # If directory already exists
   git clone https://github.com/jbfly/jbcave.git
   ```

5. Set proper permissions:
   ```bash
   sudo chown -R http:http jbcave
   chmod 655 /srv/http/jbcave/php/*.php
   ```

6. Set up the database configuration:
   ```bash
   cd /srv/http/jbcave/php
   cp config.template.php config.php
   nano config.php # Edit with your credentials
   ```

### Setting Up SSH Keys for Password-less Deployment

To avoid typing your password each time you deploy:

1. Generate an SSH key on your development machine (if you don't have one):
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. Copy the key to your server:
   ```bash
   ssh-copy-id jbfly@bonewitz.net
   ```

### Creating a Deployment Script

1. Create a deployment script in your development directory:
   ```bash
   cd ~/git/jbcave-dev
   nano deploy.sh
   ```

2. Add this content to the script:
   ```bash
   #!/bin/bash
   echo "Deploying JBCave to production..."
   
   # Push local changes to GitHub
   git add .
   git commit -m "Deployment: $(date)"
   git push
   
   # SSH into server and pull changes
   ssh jbfly@bonewitz.net 'cd /srv/http/jbcave && git pull'
   
   echo "Deployment complete!"
   ```

3. Make the script executable:
   ```bash
   chmod +x deploy.sh
   ```

### Using the Deployment Script

Whenever you want to deploy changes to production:

1. Make changes in your local repository
2. Test the changes locally
3. Run the deployment script:
   ```bash
   ./deploy.sh
   ```

This will:
- Commit your changes to Git
- Push them to GitHub
- Pull the changes on your server

### Troubleshooting

- If the script fails to connect to your server, check your SSH configuration
- If Git operations fail, ensure you have proper permissions
- If database features don't work, verify your config.php settings
- If your config.php gets overwritten, check that it's in your .gitignore file

## License

[MIT License](LICENSE)

## Credits

- Original concept inspired by SFCave
- Developed by John Bonewitz