import type { Files } from "./workspace";

/**
 * Repository-ready mobile scaffolding (Phase 5). Every project scaffolded as
 * "mobile-ready" ships with Capacitor + Expo config and version-controlled
 * Android / iOS skeletons, so local Gradle (.apk/.aab) and Xcode (.ipa)
 * exports can be triggered without extra setup. These are static stubs — the
 * APK Forge tab drives the (simulated) compile.
 */

export function mobileStubs(appName = "OG-BOT App", pkg = "com.ogbot.app"): Files {
  const slug =
    appName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "og-bot-app";
  return {
    "capacitor.config.ts": `import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "${pkg}",
  appName: "${appName}",
  webDir: ".",
  bundledWebRuntime: false,
  server: { androidScheme: "https" },
  android: { allowMixedContent: false },
  ios: { contentInset: "always" },
};

export default config;
`,
    "app.json": JSON.stringify(
      {
        expo: {
          name: appName,
          slug,
          version: "1.0.0",
          orientation: "portrait",
          platforms: ["ios", "android"],
          android: { package: pkg },
          ios: { bundleIdentifier: pkg },
          plugins: ["expo-build-properties"],
        },
      },
      null,
      2,
    ),
    "android/app/build.gradle": `// Version-controlled Android skeleton — run: ./gradlew assembleRelease (.apk) / bundleRelease (.aab)
apply plugin: "com.android.application"

android {
    namespace "${pkg}"
    compileSdk 34
    defaultConfig {
        applicationId "${pkg}"
        minSdk 23
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
    }
    buildTypes {
        release {
            minifyEnabled true
            signingConfig signingConfigs.release
        }
    }
}

dependencies {
    implementation project(":capacitor-android")
}
`,
    "ios/App/App/Info.plist": `<?xml version="1.0" encoding="UTF-8"?>
<!-- Version-controlled iOS skeleton — open ios/App/App.xcworkspace in Xcode to export .ipa -->
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key><string>${appName}</string>
  <key>CFBundleIdentifier</key><string>${pkg}</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>UILaunchStoryboardName</key><string>LaunchScreen</string>
</dict>
</plist>
`,
    "mobile/README.md": `# ${appName} — native builds

This project is pre-wired for mobile from day one.

## Android (.apk / .aab)
\`\`\`
npx cap sync android
cd android && ./gradlew assembleRelease   # .apk
cd android && ./gradlew bundleRelease     # .aab
\`\`\`

## iOS (.ipa, macOS + Xcode)
\`\`\`
npx cap sync ios
open ios/App/App.xcworkspace
\`\`\`

App id: \`${pkg}\`. The APK Forge tab drives these steps offline.
`,
  };
}

/** Merge mobile stubs into an existing web project's files. */
export function withMobileStubs(files: Files, appName?: string, pkg?: string): Files {
  return { ...files, ...mobileStubs(appName, pkg) };
}
