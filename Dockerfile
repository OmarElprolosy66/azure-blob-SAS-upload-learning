# Save this as Dockerfile
# Use a standard Node.js image
FROM node:24-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to copy both package.json and package-lock.json
COPY package*.json ./

RUN npm ci


# Copy the rest of the app (tsconfig and TS source)
COPY tsconfig.json .
COPY . .

# Build TypeScript -> dist/
# RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Define the command to run the app using ts-node
CMD [ "npm", "run", "dev" ]
