/*
 * Root build script — just project metadata. Plugin versions live in
 * `settings.gradle.kts`'s `pluginManagement` block so each module can apply
 * its plugin without restating the version.
 */

allprojects {
    group = providers.gradleProperty("GROUP").get()
    version = providers.gradleProperty("VERSION").get()
}
