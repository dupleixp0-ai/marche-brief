FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3200
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
