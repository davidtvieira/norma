# The API: Spring Boot, built in a Maven image and run on a plain JRE.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
# The dependencies first, so they stay cached until the pom changes.
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre
RUN useradd --system --create-home --home-dir /app norma && mkdir -p /data/nrm && chown -R norma /data
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
USER norma
ENV NORMA_STORAGE_DIR=/data/nrm \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
