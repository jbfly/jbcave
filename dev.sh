#!/bin/bash

# JBCave Development Helper
# -------------------------

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function print_header() {
    echo -e "${BLUE}====================================================${NC}"
    echo -e "${BLUE}  JBCave Development Helper${NC}"
    echo -e "${BLUE}====================================================${NC}"
    echo ""
}

function print_help() {
    print_header
    echo "Commands:"
    echo -e "  ${GREEN}start${NC}      - Start development server"
    echo -e "  ${GREEN}db:create${NC}  - Create database schema"
    echo -e "  ${GREEN}db:reset${NC}   - Reset database (delete all scores)"
    echo -e "  ${GREEN}db:seed${NC}    - Add sample high scores"
    echo -e "  ${GREEN}db:list${NC}    - Show current high scores"
    echo -e "  ${GREEN}deploy${NC}     - Deploy to production"
    echo -e "  ${GREEN}help${NC}       - Show this help"
    echo ""
}

function check_db_connection() {
    if ! mysql -u jbcave_user -pdevpassword jbcave_db -e "SELECT 1" &>/dev/null; then
        echo -e "${RED}Database connection failed!${NC}"
        echo "Make sure:"
        echo "  1. MariaDB is running: sudo systemctl start mariadb"
        echo "  2. Database and user exist: ./dev.sh db:create"
        return 1
    fi
    return 0
}

function start_server() {
    print_header
    echo -e "${GREEN}Starting PHP development server...${NC}"
    echo -e "Visit ${BLUE}http://localhost:8000${NC} in your browser"
    echo "Press Ctrl+C to stop the server"
    echo ""
    
    # Make sure db connection works before starting
    if ! check_db_connection; then
        echo -e "${YELLOW}Starting server anyway, but database features may not work${NC}"
    fi
    
    # Start PHP server
    php -S localhost:8000 -t .
}

function create_database() {
    print_header
    echo -e "${GREEN}Creating database and user...${NC}"
    
    # Need to run as root or user with access
    if [ "$EUID" -ne 0 ]; then
        echo -e "${YELLOW}This command needs database admin access.${NC}"
        echo "Enter your sudo password if prompted:"
        
        # Run the command through sudo
        sudo mysql -e "
        CREATE DATABASE IF NOT EXISTS jbcave_db;
        USE jbcave_db;
        
        CREATE TABLE IF NOT EXISTS jbcave_highscores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            player_name VARCHAR(20) NOT NULL,
            score INT NOT NULL,
            date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Create user (drop if exists to reset password)
        DROP USER IF EXISTS 'jbcave_user'@'localhost';
        CREATE USER 'jbcave_user'@'localhost' IDENTIFIED BY 'devpassword';
        GRANT SELECT, INSERT, UPDATE, DELETE ON jbcave_db.* TO 'jbcave_user'@'localhost';
        FLUSH PRIVILEGES;
        "
    else
        # Already running as root
        mysql -e "
        CREATE DATABASE IF NOT EXISTS jbcave_db;
        USE jbcave_db;
        
        CREATE TABLE IF NOT EXISTS jbcave_highscores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            player_name VARCHAR(20) NOT NULL,
            score INT NOT NULL,
            date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Create user (drop if exists to reset password)
        DROP USER IF EXISTS 'jbcave_user'@'localhost';
        CREATE USER 'jbcave_user'@'localhost' IDENTIFIED BY 'devpassword';
        GRANT SELECT, INSERT, UPDATE, DELETE ON jbcave_db.* TO 'jbcave_user'@'localhost';
        FLUSH PRIVILEGES;
        "
    fi
    
    echo -e "${GREEN}Database setup complete!${NC}"
}

function reset_database() {
    print_header
    echo -e "${YELLOW}Resetting database (deleting all scores)...${NC}"
    
    if check_db_connection; then
        mysql -u jbcave_user -pdevpassword jbcave_db -e "TRUNCATE TABLE jbcave_highscores;"
        echo -e "${GREEN}Database reset complete!${NC}"
    fi
}

function seed_database() {
    print_header
    echo -e "${GREEN}Adding sample high scores...${NC}"
    
    if check_db_connection; then
        mysql -u jbcave_user -pdevpassword jbcave_db -e "
        INSERT INTO jbcave_highscores (player_name, score, date_added) VALUES 
        ('Player1', 1500, NOW() - INTERVAL 10 DAY),
        ('JohnB', 1200, NOW() - INTERVAL 7 DAY),
        ('Cave Master', 1000, NOW() - INTERVAL 5 DAY),
        ('Flyer42', 800, NOW() - INTERVAL 3 DAY),
        ('GameTester', 600, NOW() - INTERVAL 1 DAY),
        ('Newbie', 300, NOW());
        "
        echo -e "${GREEN}Sample data added!${NC}"
    fi
}

function list_scores() {
    print_header
    echo -e "${GREEN}Current high scores:${NC}"
    
    if check_db_connection; then
        mysql -u jbcave_user -pdevpassword jbcave_db -e "
        SELECT id, player_name, score, date_added FROM jbcave_highscores ORDER BY score DESC LIMIT 15;
        "
    fi
}

function deploy_to_production() {
    print_header
    echo -e "${YELLOW}Deploying to production...${NC}"
    
    if [ -f "./deploy.sh" ]; then
        ./deploy.sh
    else
        echo -e "${RED}deploy.sh script not found!${NC}"
        echo "Make sure you're in the project root directory."
    fi
}

# Check if config.php exists, create if not
if [ ! -f "php/config.php" ]; then
    echo -e "${YELLOW}config.php not found, creating from template...${NC}"
    cp php/config.template.php php/config.php
    
    # Update database password in the config
    sed -i 's/your_password_here/devpassword/g' php/config.php
    
    echo -e "${GREEN}Created config.php${NC}"
fi

# Process command
case "$1" in
    start)
        start_server
        ;;
    db:create)
        create_database
        ;;
    db:reset)
        reset_database
        ;;
    db:seed)
        seed_database
        ;;
    db:list)
        list_scores
        ;;
    deploy)
        deploy_to_production
        ;;
    help|--help|-h|"")
        print_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        print_help
        exit 1
        ;;
esac