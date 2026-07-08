const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

module.exports = function withNetworkSecurityProbe(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const packageName = modConfig.android?.package ?? "ai.praxisshield.app";
      const projectRoot = modConfig.modRequest.projectRoot;
      const packagePath = packageName.replace(/\./g, "/");
      const moduleDir = path.join(projectRoot, "android/app/src/main/java", packagePath, "networkprobe");
      fs.mkdirSync(moduleDir, { recursive: true });

      fs.writeFileSync(
        path.join(moduleDir, "PraxisShieldNetworkProbeModule.kt"),
        androidModuleSource(packageName)
      );
      fs.writeFileSync(
        path.join(moduleDir, "PraxisShieldNetworkProbePackage.kt"),
        androidPackageSource(packageName)
      );

      patchMainApplication(projectRoot, packageName);
      return modConfig;
    }
  ]);
};

function patchMainApplication(projectRoot, packageName) {
  const packagePath = packageName.replace(/\./g, "/");
  const candidates = [
    path.join(projectRoot, "android/app/src/main/java", packagePath, "MainApplication.kt"),
    path.join(projectRoot, "android/app/src/main/java", packagePath, "MainApplication.java")
  ];
  const mainApplication = candidates.find((candidate) => fs.existsSync(candidate));
  if (!mainApplication) return;

  let contents = fs.readFileSync(mainApplication, "utf8");
  const importLine = `import ${packageName}.networkprobe.PraxisShieldNetworkProbePackage`;
  if (!contents.includes(importLine)) {
    contents = contents.replace(/(import com\.facebook\.react\.PackageList[^\n]*\n)/, `$1${importLine}\n`);
  }

  if (!contents.includes("PraxisShieldNetworkProbePackage()")) {
    contents = contents.replace(
      /(val packages = PackageList\(this\)\.packages\s*\n)/,
      `$1            packages.add(PraxisShieldNetworkProbePackage())\n`
    );
    contents = contents.replace(
      /(List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);\s*\n)/,
      `$1    packages.add(new PraxisShieldNetworkProbePackage());\n`
    );
  }

  fs.writeFileSync(mainApplication, contents);
}

function androidPackageSource(packageName) {
  return `package ${packageName}.networkprobe

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class PraxisShieldNetworkProbePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(PraxisShieldNetworkProbeModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

function androidModuleSource(packageName) {
  return `package ${packageName}.networkprobe

import android.content.Context
import android.net.wifi.WifiManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.util.concurrent.Executors

class PraxisShieldNetworkProbeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  private val executor = Executors.newCachedThreadPool()

  override fun getName(): String = "PraxisShieldNetworkProbe"

  @ReactMethod
  fun getWifiSecurityDetails(promise: Promise) {
    executor.execute {
      try {
        val wifiManager = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val connection = wifiManager.connectionInfo
        val currentSsid = connection.ssid?.trim('"') ?: ""
        val currentBssid = connection.bssid
        val scanResult = wifiManager.scanResults.firstOrNull {
          (it.BSSID == currentBssid && currentBssid != null) || it.SSID == currentSsid
        }
        promise.resolve(wifiDetails(scanResult?.capabilities))
      } catch (error: SecurityException) {
        promise.resolve(unavailableWifi("android_wifi_permission_denied"))
      } catch (error: Exception) {
        promise.resolve(unavailableWifi(error.message ?: "android_wifi_probe_failed"))
      }
    }
  }

  @ReactMethod
  fun probeTcpPorts(request: ReadableMap, promise: Promise) {
    executor.execute {
      val host = request.getString("host") ?: ""
      val timeoutMs = if (request.hasKey("timeoutMs")) request.getInt("timeoutMs") else 1200
      val ports = request.getArray("ports")
      val results = Arguments.createArray()

      if (host.isBlank() || ports == null) {
        promise.resolve(results)
        return@execute
      }

      for (index in 0 until ports.size()) {
        val port = ports.getInt(index)
        val startedAt = System.currentTimeMillis()
        val result = Arguments.createMap()
        result.putString("host", host)
        result.putInt("port", port)
        result.putString("source", "measured")

        try {
          Socket().use { socket ->
            socket.connect(InetSocketAddress(host, port), timeoutMs)
          }
          result.putString("state", "open")
        } catch (error: java.net.SocketTimeoutException) {
          result.putString("state", "filtered")
          result.putString("errorCode", "timeout")
        } catch (error: Exception) {
          result.putString("state", "closed")
          result.putString("errorCode", error.javaClass.simpleName)
        }

        result.putInt("latencyMs", (System.currentTimeMillis() - startedAt).toInt())
        results.pushMap(result)
      }

      promise.resolve(results)
    }
  }

  @ReactMethod
  fun probeSsdp(request: ReadableMap, promise: Promise) {
    executor.execute {
      val timeoutMs = if (request.hasKey("timeoutMs")) request.getInt("timeoutMs") else 1600
      val devices = Arguments.createArray()

      try {
        DatagramSocket().use { socket ->
          socket.soTimeout = timeoutMs
          val message = "M-SEARCH * HTTP/1.1\\r\\n" +
            "HOST: 239.255.255.250:1900\\r\\n" +
            "MAN: \\"ssdp:discover\\"\\r\\n" +
            "MX: 1\\r\\n" +
            "ST: upnp:rootdevice\\r\\n\\r\\n"
          val payload = message.toByteArray(Charsets.UTF_8)
          socket.send(DatagramPacket(payload, payload.size, InetAddress.getByName("239.255.255.250"), 1900))

          val deadline = System.currentTimeMillis() + timeoutMs
          while (System.currentTimeMillis() < deadline) {
            val buffer = ByteArray(4096)
            val packet = DatagramPacket(buffer, buffer.size)
            try {
              socket.receive(packet)
              devices.pushMap(parseSsdp(String(packet.data, 0, packet.length, Charsets.UTF_8)))
            } catch (_: java.net.SocketTimeoutException) {
              break
            }
          }
        }

        val result = Arguments.createMap()
        result.putBoolean("active", devices.size() > 0)
        result.putString("source", "measured")
        result.putString("confidence", if (devices.size() > 0) "high" else "medium")
        result.putArray("devices", devices)
        promise.resolve(result)
      } catch (error: Exception) {
        val result = Arguments.createMap()
        result.putNull("active")
        result.putString("source", "unavailable")
        result.putString("confidence", "low")
        result.putArray("devices", devices)
        result.putString("errorCode", error.javaClass.simpleName)
        promise.resolve(result)
      }
    }
  }

  @ReactMethod
  fun getIpv6NetworkInfo(promise: Promise) {
    executor.execute {
      try {
        val globalAddresses = Arguments.createArray()
        val uniqueLocalAddresses = Arguments.createArray()
        val linkLocalAddresses = Arguments.createArray()
        val interfaces = NetworkInterface.getNetworkInterfaces()

        while (interfaces.hasMoreElements()) {
          val networkInterface = interfaces.nextElement()
          if (!networkInterface.isUp || networkInterface.isLoopback) continue
          val addresses = networkInterface.inetAddresses
          while (addresses.hasMoreElements()) {
            val address = addresses.nextElement().hostAddress ?: continue
            if (!address.contains(":")) continue
            val normalized = address.substringBefore("%").lowercase()
            when {
              normalized.startsWith("fe80") -> linkLocalAddresses.pushString(normalized)
              normalized.startsWith("fc") || normalized.startsWith("fd") -> uniqueLocalAddresses.pushString(normalized)
              normalized.startsWith("2") || normalized.startsWith("3") -> globalAddresses.pushString(normalized)
            }
          }
        }

        val dnsServers = Arguments.createArray()
        val result = Arguments.createMap()
        val enabled = globalAddresses.size() > 0 || uniqueLocalAddresses.size() > 0 || linkLocalAddresses.size() > 0
        result.putBoolean("enabled", enabled)
        result.putArray("globalAddresses", globalAddresses)
        result.putArray("uniqueLocalAddresses", uniqueLocalAddresses)
        result.putArray("linkLocalAddresses", linkLocalAddresses)
        result.putArray("dnsServers", dnsServers)
        result.putNull("gatewayVisible")
        result.putString("source", if (enabled) "measured" else "unavailable")
        result.putString("confidence", if (enabled) "medium" else "low")
        promise.resolve(result)
      } catch (error: Exception) {
        val result = Arguments.createMap()
        result.putBoolean("enabled", false)
        result.putArray("globalAddresses", Arguments.createArray())
        result.putArray("uniqueLocalAddresses", Arguments.createArray())
        result.putArray("linkLocalAddresses", Arguments.createArray())
        result.putArray("dnsServers", Arguments.createArray())
        result.putNull("gatewayVisible")
        result.putString("source", "unavailable")
        result.putString("confidence", "low")
        result.putString("errorCode", error.javaClass.simpleName)
        promise.resolve(result)
      }
    }
  }

  private fun wifiDetails(capabilities: String?) = if (capabilities.isNullOrBlank()) {
    unavailableWifi("android_wifi_capabilities_unavailable")
  } else {
    val normalized = capabilities.uppercase()
    val protocol = when {
      normalized.contains("SAE") || normalized.contains("WPA3") -> "WPA3"
      normalized.contains("WPA2") || normalized.contains("RSN") -> "WPA2"
      normalized.contains("WPA") -> "WPA"
      normalized.contains("WEP") -> "WEP"
      else -> "OPEN"
    }
    val map = Arguments.createMap()
    map.putString("protocol", protocol)
    map.putString("authMode", "unknown")
    map.putBoolean("isEnterprise", normalized.contains("EAP"))
    map.putBoolean("isPersonal", normalized.contains("PSK") || normalized.contains("SAE"))
    map.putBoolean("isMixedMode", normalized.contains("PSK") && normalized.contains("SAE"))
    map.putBoolean("supportsWpa3", normalized.contains("SAE") || normalized.contains("WPA3"))
    map.putString("capabilities", capabilities)
    map.putString("source", "measured")
    map.putString("confidence", "high")
    map.putArray("platformLimitations", Arguments.createArray())
    map
  }

  private fun unavailableWifi(errorCode: String) = Arguments.createMap().apply {
    putString("protocol", "UNKNOWN")
    putString("authMode", "unknown")
    putBoolean("isEnterprise", false)
    putBoolean("isPersonal", false)
    putBoolean("isMixedMode", false)
    putBoolean("supportsWpa3", false)
    putString("source", "unavailable")
    putString("confidence", "low")
    putString("errorCode", errorCode)
    putArray("platformLimitations", Arguments.createArray())
  }

  private fun parseSsdp(text: String) = Arguments.createMap().apply {
    text.split("\\r\\n").forEach { line ->
      val separator = line.indexOf(':')
      if (separator <= 0) return@forEach
      val key = line.substring(0, separator).trim().lowercase()
      val value = line.substring(separator + 1).trim()
      when (key) {
        "location", "server", "usn", "st" -> putString(key, value)
      }
    }
  }
}
`;
}
