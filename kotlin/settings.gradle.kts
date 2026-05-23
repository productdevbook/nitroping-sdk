/*
 * settings.gradle.kts — top-level Gradle project structure.
 *
 * Two modules:
 *   - :nitroping          → pure JVM core (zero Android deps)
 *   - :nitroping-android  → Android sugar (FCM payload helpers)
 *
 * The Android module is *only* included when AGP / Android SDK are
 * available on the build host. CI installs the SDK for the android job;
 * the default `:nitroping:test` task on a vanilla JDK runner skips this
 * inclusion. Detection: presence of `ANDROID_HOME` / `ANDROID_SDK_ROOT`
 * env var, or the `local.properties` file with `sdk.dir=` set.
 *
 * Forcibly opt out by exporting `NITROPING_SKIP_ANDROID=1` — useful when
 * the host has an Android SDK installed but you only want a fast core
 * build (CI does this).
 */

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }

    plugins {
        // Pin the Kotlin + AGP versions here so each module can apply them
        // without restating the version (and the version is in one file).
        kotlin("jvm") version "2.0.21"
        kotlin("android") version "2.0.21"
        id("com.android.library") version "8.6.1"
        id("com.vanniktech.maven.publish") version "0.30.0"
    }
}

// Foojay toolchain resolver — lets Gradle download a JDK 17 on hosts that
// don't have one (CI mostly ships 21+). Without this, our `jvmToolchain(17)`
// declaration in module build scripts fails on a runner that only has 21.
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "0.8.0"
}

@Suppress("UnstableApiUsage")
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "nitroping-sdk-kotlin"

include(":nitroping")

// Only include the Android module when an SDK is actually available and
// the user hasn't opted out. Avoids "SDK location not found" failures on
// a plain JDK CI runner that only wants to build / test the core.
val androidSdkAvailable: Boolean = run {
    if (System.getenv("NITROPING_SKIP_ANDROID")?.takeIf { it.isNotEmpty() } != null) return@run false
    val env = System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT")
    val localProps = file("local.properties")
    val sdkInLocalProps = localProps.exists() &&
        localProps.readLines().any { it.startsWith("sdk.dir=") }
    !env.isNullOrEmpty() || sdkInLocalProps
}

if (androidSdkAvailable) {
    include(":nitroping-android")
}
