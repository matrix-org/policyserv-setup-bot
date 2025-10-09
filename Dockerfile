# We can't use `-alpine` because it is incompatible with the rust-sdk crypto bindings
FROM node:24-slim

# Do as much as possible before we break the build cache by copying our code over
# Note: we use a development environment so we install dev dependencies, like tsx
ENV NODE_ENV=development
WORKDIR /app

# Install project
COPY . /app
# Remove node modules just in case this is a development environment that got copied over.
# We `|| true` to ignore errors here (as it might not exist)
RUN rm -r /app/node_modules || true
RUN npm install --loglevel verbose

# Runtime stuff (healthz, default execution)
EXPOSE 8080
CMD ["npm", "start"]
