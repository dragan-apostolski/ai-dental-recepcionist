# Use a slim Node.js image
FROM node:20-slim

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy server source code
COPY . .

# Expose port (Cloud Run defaults to 8080)
EXPOSE 8080

# For production, we run the TypeScript server directly using ts-node as configured in package.json.
# A more optimized setup would involve a build step (tsc) and running standard JS.
CMD ["npm", "start"]
