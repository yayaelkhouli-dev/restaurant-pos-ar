#!/bin/bash

# Database Reset Script
# This script resets the database with fresh schema and seed data

set -e  # Exit on any error

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 POS System - Database Reset${NC}"
echo "================================="
echo ""

# Check if database container is running
CONTAINER_NAME="pos-postgres-dev"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    CONTAINER_NAME="pos-postgres"
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${RED}❌ Database container is not running!${NC}"
        echo -e "${YELLOW}Please run 'make up' or 'make dev' first.${NC}"
        exit 1
    fi
fi

# Check that the init directory exists (we load ALL files 01..NN in order)
INIT_DIR="database/init"

if [[ ! -d "$INIT_DIR" ]] || [[ -z "$(ls -A "$INIT_DIR"/*.sql 2>/dev/null)" ]]; then
    echo -e "${RED}❌ Init SQL directory not found or empty: $INIT_DIR${NC}"
    exit 1
fi

echo -e "${YELLOW}This will:${NC}"
echo "1. 🗑️  Drop all existing tables and data"
echo "2. 🏗️  Recreate database schema"
echo "3. 🌱 Load fresh seed data"
echo "4. ✅ Reset the database to initial state"
echo ""

# Show current database contents
echo -e "${YELLOW}Current database contents:${NC}"
docker exec $CONTAINER_NAME psql -U postgres -d pos_system -c "
SELECT 
    'Users' as table_name, COUNT(*) as records FROM users
UNION ALL SELECT 
    'Orders' as table_name, COUNT(*) as records FROM orders
UNION ALL SELECT 
    'Products' as table_name, COUNT(*) as records FROM products
UNION ALL SELECT 
    'Categories' as table_name, COUNT(*) as records FROM categories
UNION ALL SELECT 
    'Tables' as table_name, COUNT(*) as records FROM dining_tables
UNION ALL SELECT 
    'Payments' as table_name, COUNT(*) as records FROM payments
ORDER BY table_name;
" 2>/dev/null || echo "Database may be empty or corrupted"

echo ""
echo -e "${YELLOW}Continue with database reset? (y/N):${NC}"
read -p "> " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}❌ Operation cancelled${NC}"
    exit 0
fi

# Create backup before reset
BACKUP_DIR="backups"
mkdir -p $BACKUP_DIR
BACKUP_FILE="$BACKUP_DIR/pre_reset_backup_$(date +%Y%m%d_%H%M%S).sql"

echo -e "${YELLOW}💾 Creating backup before reset: $BACKUP_FILE${NC}"
docker exec $CONTAINER_NAME pg_dump -U postgres pos_system > $BACKUP_FILE 2>/dev/null || echo "Could not create backup (database may be empty)"

echo -e "${YELLOW}🗑️  Dropping existing database and recreating...${NC}"

# Drop and recreate database (separate commands to avoid transaction issues)
echo "  - Dropping existing database..."
docker exec $CONTAINER_NAME psql -U postgres -c "DROP DATABASE IF EXISTS pos_system;"

if [[ $? -ne 0 ]]; then
    echo -e "${RED}❌ Failed to drop database!${NC}"
    exit 1
fi

echo "  - Creating new database..."
docker exec $CONTAINER_NAME psql -U postgres -c "CREATE DATABASE pos_system;"

if [[ $? -ne 0 ]]; then
    echo -e "${RED}❌ Failed to recreate database!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Database recreated${NC}"

echo -e "${YELLOW}🏗️  Loading all init files (schema + seed + migrations) in order...${NC}"

# Load EVERY file in database/init in numeric order (01_schema, 02_seed, 03..NN).
# Previously only 01+02 were loaded, so settings/recipes/migrations were missing.
for f in $(ls "$INIT_DIR"/*.sql | sort); do
    echo "  - Loading $(basename "$f") ..."
    docker exec -i $CONTAINER_NAME psql -U postgres -d pos_system -v ON_ERROR_STOP=1 < "$f"
    if [[ $? -ne 0 ]]; then
        echo -e "${RED}❌ Failed to load $(basename "$f")!${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ All init files loaded successfully${NC}"

# Verify the reset
echo ""
echo -e "${BLUE}📊 Database reset verification:${NC}"

# Check table structure
echo -e "${YELLOW}Tables created:${NC}"
docker exec $CONTAINER_NAME psql -U postgres -d pos_system -c "\dt"

echo ""
echo -e "${YELLOW}Data loaded:${NC}"
docker exec $CONTAINER_NAME psql -U postgres -d pos_system -c "
SELECT 
    'Users' as table_name, COUNT(*) as records FROM users
UNION ALL SELECT 
    'Categories' as table_name, COUNT(*) as records FROM categories
UNION ALL SELECT 
    'Products' as table_name, COUNT(*) as records FROM products
UNION ALL SELECT 
    'Tables' as table_name, COUNT(*) as records FROM dining_tables
UNION ALL SELECT 
    'Orders' as table_name, COUNT(*) as records FROM orders
UNION ALL SELECT 
    'Order Items' as table_name, COUNT(*) as records FROM order_items
UNION ALL SELECT 
    'Payments' as table_name, COUNT(*) as records FROM payments
UNION ALL SELECT 
    'Inventory' as table_name, COUNT(*) as records FROM inventory
ORDER BY table_name;
"

echo ""
echo -e "${GREEN}🎉 Database reset completed successfully!${NC}"
echo ""
echo -e "${BLUE}Default users available:${NC}"

# Show default users
docker exec $CONTAINER_NAME psql -U postgres -d pos_system -c "
SELECT username, email, role, is_active 
FROM users 
ORDER BY role, username;
"

echo ""
echo -e "${YELLOW}💡 Default login credentials:${NC}"
echo "  Username: admin    | Password: admin123    | Role: admin"
echo "  Username: manager1 | Password: admin123    | Role: manager"
echo "  Username: server1  | Password: admin123    | Role: server"
echo "  Username: server2  | Password: admin123    | Role: server"
echo "  Username: counter1 | Password: admin123    | Role: counter"
echo "  Username: counter2 | Password: admin123    | Role: counter"
echo "  Username: kitchen1 | Password: admin123    | Role: kitchen"
echo ""
echo -e "${YELLOW}💾 Pre-reset backup saved to: $BACKUP_FILE${NC}"
echo -e "${BLUE}🚀 The system is now ready for development!${NC}"
