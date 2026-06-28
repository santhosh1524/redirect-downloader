# Use official Puppeteer pre-configured image (includes Chromium and Node)
FROM ghcr.io/puppeteer/puppeteer:22.6.0

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application files
COPY . .

# Expose port 3000
EXPOSE 3000

# Start the Express server
CMD [ "node", "server.js" ]
