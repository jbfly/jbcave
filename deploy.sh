#!/bin/bash
echo "Deploying JBCave to production..."

# Push local changes to GitHub
git add .
git commit -m "Deployment: $(date)"
git push

# SSH into server and pull changes
ssh jbfly@bonewitz.net 'cd /srv/http/jbcave && git pull'

echo "Deployment complete!"