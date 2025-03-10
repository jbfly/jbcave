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

## Local Development

### Quick Start

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

## Development and Deployment

### Local Development

1. Make changes to the code locally
2. Test using a local web server

### Deployment to Production

1. Commit your changes to Git:
   ```bash
   git add .
   git commit -m "Description of your changes"
   git push
   ```

2. On your server:
   ```bash
   cd /path/to/www/jbcave
   git pull
   ```

Make sure your server has the same configuration as your local environment.

## License

[MIT License](LICENSE)

## Credits

- Original concept inspired by SFCave
- Developed by John Bonewitz