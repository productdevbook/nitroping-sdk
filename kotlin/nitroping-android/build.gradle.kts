/*
 * Android sugar module.
 *
 * Depends on `:nitroping` (core) + Android. Only the FCM payload helpers
 * live here; HTTP / coroutines / webhook verification all come from core.
 *
 * `minSdk = 24` because that's where `java.net.http.HttpClient` is
 * usable on Android via AGP's core library desugaring. Apps targeting
 * older devices can still consume the core directly through a tiny
 * façade — opening that path is left for a follow-up if anyone asks.
 *
 * Maven Central publishing for this Android module is deferred — set up
 * once Android SDK is configured in CI. Core JVM module (sibling `:nitroping`)
 * is the public Maven artifact today.
 */

plugins {
    id("com.android.library")
    kotlin("android")
    `maven-publish`
}

android {
    namespace = "dev.nitroping.android"
    compileSdk = 34

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions { jvmTarget = "17" }

    sourceSets["main"].kotlin.srcDirs("src/main/kotlin")
    sourceSets["test"].kotlin.srcDirs("src/test/kotlin")

    publishing {
        singleVariant("release") {
            withSourcesJar()
        }
    }
}

kotlin {
    explicitApi()
}

dependencies {
    api(project(":nitroping"))
    // androidx.core-ktx isn't strictly required (we only read Map<String,String>
    // from RemoteMessage.data), but pin a recent stable so consumers don't have
    // to opt in to maintenance versions just to satisfy the transitive graph.
    implementation("androidx.core:core-ktx:1.13.1")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.2")

    testImplementation(platform("org.junit:junit-bom:5.10.2"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation(kotlin("test"))
}

afterEvaluate {
    publishing {
        publications {
            create<MavenPublication>("release") {
                from(components["release"])
                pom {
                    name.set("nitroping-android")
                    description.set("Android sugar (FCM payload helpers) for the nitroping Kotlin SDK.")
                    url.set(providers.gradleProperty("POM_URL"))
                    licenses {
                        license {
                            name.set(providers.gradleProperty("POM_LICENSE_NAME"))
                            url.set(providers.gradleProperty("POM_LICENSE_URL"))
                        }
                    }
                }
            }
        }
    }
}
