import com.vanniktech.maven.publish.SonatypeHost

/*
 * Core module — pure JVM, zero Android deps.
 *
 * Runtime deps:
 *   - kotlinx-coroutines-core  (suspend functions + `await()` bridge to
 *                               java.net.http.HttpClient)
 *
 * Everything else is JDK stdlib:
 *   - HTTP: java.net.http.HttpClient (JDK 11+)
 *   - HMAC: javax.crypto.Mac
 *   - JSON: hand-rolled in dev.nitroping.internal.Json
 *
 * Tests: JUnit 5 + kotlinx-coroutines-test + kotlin-test (assertions).
 * HTTP stubbing is done by spinning up `com.sun.net.httpserver.HttpServer`
 * on an ephemeral port — keeps the test deps small.
 */

plugins {
    kotlin("jvm")
    `java-library`
    id("com.vanniktech.maven.publish")
}

kotlin {
    jvmToolchain(17)
    explicitApi()
}

dependencies {
    // Only acceptable runtime dep — coroutines is de-facto stdlib for
    // modern Kotlin (kotlin-stdlib + kotlinx-coroutines-core ships in 95%+
    // of Kotlin server projects). Mirrors the README's promise.
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")

    testImplementation(platform("org.junit:junit-bom:5.10.2"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
        showStandardStreams = false
    }
}

mavenPublishing {
    publishToMavenCentral(SonatypeHost.CENTRAL_PORTAL, automaticRelease = true)
    signAllPublications()

    coordinates(
        groupId = providers.gradleProperty("GROUP").get(),
        artifactId = "nitroping",
        version = providers.gradleProperty("VERSION").get(),
    )

    pom {
        name.set(providers.gradleProperty("POM_NAME"))
        description.set(providers.gradleProperty("POM_DESCRIPTION"))
        url.set(providers.gradleProperty("POM_URL"))
        licenses {
            license {
                name.set(providers.gradleProperty("POM_LICENSE_NAME"))
                url.set(providers.gradleProperty("POM_LICENSE_URL"))
                distribution.set(providers.gradleProperty("POM_LICENSE_DIST"))
            }
        }
        developers {
            developer {
                id.set(providers.gradleProperty("POM_DEVELOPER_ID"))
                name.set(providers.gradleProperty("POM_DEVELOPER_NAME"))
                url.set(providers.gradleProperty("POM_DEVELOPER_URL"))
            }
        }
        scm {
            url.set(providers.gradleProperty("POM_SCM_URL"))
            connection.set("scm:git:" + providers.gradleProperty("POM_SCM_URL").get() + ".git")
            developerConnection.set("scm:git:" + providers.gradleProperty("POM_SCM_URL").get() + ".git")
        }
    }
}
