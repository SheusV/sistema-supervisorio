FROM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
COPY examples/ /build/examples/
RUN npm test && npm run build

FROM maven:3.9.11-eclipse-temurin-21 AS backend
WORKDIR /build
COPY backend/pom.xml backend/pom.xml
RUN mvn -B -ntp -f backend/pom.xml dependency:go-offline
COPY backend/src/ backend/src/
COPY --from=frontend /build/frontend/dist/ frontend/dist/
RUN mvn -B -ntp -f backend/pom.xml -Pweb-ui verify

FROM eclipse-temurin:21-jre-jammy AS runtime
WORKDIR /app
RUN groupadd --gid 10001 scada && useradd --uid 10001 --gid scada --no-create-home scada
COPY --from=backend --chown=scada:scada /build/backend/target/scada-platform-0.1.0.jar /app/scada.jar
USER scada
ENV SPRING_PROFILES_ACTIVE=hosted
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/scada.jar"]
