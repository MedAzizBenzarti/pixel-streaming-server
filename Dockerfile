FROM node:lts

# Copy everything in your repo (e.g., cirrus.js, package.json, etc.)
COPY . .

# Install dependencies and run the server
RUN npm install

EXPOSE 80
CMD ["node", "cirrus.js"]
