import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Firebase Cloud Messaging, solo si está configurado.
//
// El plugin de Google falla la compilación cuando no encuentra
// `google-services.json`. Aplicarlo de forma incondicional obligaría a todo el
// que clone el repositorio a crear un proyecto de Firebase antes de poder
// compilar, y eso no hace falta: los recordatorios de clase son alarmas
// locales del propio teléfono y funcionan sin ninguna cuenta.
//
// Con el archivo presente, el push queda activo. Sin él,
// `Firebase.initializeApp()` falla en tiempo de ejecución, `PushService` lo
// captura y la aplicación sigue igual, sin push del servidor.
val tieneFirebase = project.file("google-services.json").exists()
if (tieneFirebase) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.lifecycle(
        "[uts] google-services.json no encontrado: se compila SIN notificaciones push. " +
            "Los recordatorios de clase siguen funcionando (alarmas locales)."
    )
}

// Credenciales de firma. Viven fuera del control de versiones (key.properties y
// el .jks están en .gitignore): un keystore filtrado permite publicar
// actualizaciones falsas de la app firmadas como si fueran oficiales.
//
// Si el archivo no existe —por ejemplo en una máquina recién clonada— la
// compilación de release cae a la clave de depuración en lugar de fallar, para
// no bloquear a quien solo quiere probar.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val hasReleaseKeystore = keystorePropertiesFile.exists()
if (hasReleaseKeystore) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "co.edu.uts.nexus.academico"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // flutter_local_notifications usa java.time para programar alarmas.
        // Sin desugaring, la app compila y revienta en tiempo de ejecución en
        // los Android antiguos que todavía usan buena parte del claustro.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "co.edu.uts.nexus.academico"
        // El almacén seguro de tokens exige Android 7.0 (API 24). Mantener 23
        // obligaría a guardar la sesión fuera del Keystore o rompería el build.
        minSdk = maxOf(flutter.minSdkVersion, 24)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                // Se resuelve desde android/, no desde android/app/, que es
                // donde `file()` buscaría por defecto en este módulo.
                storeFile = rootProject.file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
