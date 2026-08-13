import Foundation
import Network

@objc(PraxisShieldNetworkProbe)
class PraxisShieldNetworkProbe: NSObject {
  private let queue = DispatchQueue(label: "ai.praxisshield.network-probe", qos: .utility)

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(getWifiSecurityDetails:rejecter:)
  func getWifiSecurityDetails(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve([
      "protocol": "UNKNOWN",
      "authMode": "unknown",
      "isEnterprise": false,
      "isPersonal": false,
      "isMixedMode": false,
      "supportsWpa3": false,
      "source": "unavailable",
      "confidence": "low",
      "platformLimitations": [
        "iOS exposes SSID only with specific entitlements and does not expose WPA/WPA2/WPA3 capabilities through public APIs."
      ]
    ])
  }

  @objc(probeTcpPorts:resolver:rejecter:)
  func probeTcpPorts(
    request: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    guard let host = request["host"] as? String, !host.isEmpty else {
      resolve([])
      return
    }

    let ports = (request["ports"] as? [NSNumber])?.map { $0.intValue } ?? []
    let timeoutMs = (request["timeoutMs"] as? NSNumber)?.intValue ?? 1200
    let group = DispatchGroup()
    let resultLock = NSLock()
    var results: [[String: Any]] = []

    for port in ports {
      group.enter()
      probeTcpPort(host: host, port: port, timeoutMs: timeoutMs) { result in
        resultLock.lock()
        results.append(result)
        resultLock.unlock()
        group.leave()
      }
    }

    group.notify(queue: queue) {
      resolve(results.sorted { lhs, rhs in
        (lhs["port"] as? Int ?? 0) < (rhs["port"] as? Int ?? 0)
      })
    }
  }

  @objc(probeSsdp:resolver:rejecter:)
  func probeSsdp(
    request: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    let timeoutMs = (request["timeoutMs"] as? NSNumber)?.intValue ?? 1600
    guard let port = NWEndpoint.Port(rawValue: 1900) else {
      resolve(unavailableSsdp(errorCode: "invalid_ssdp_port"))
      return
    }

    let connection = NWConnection(host: "239.255.255.250", port: port, using: .udp)
    let devices = NSMutableArray()
    let lock = NSLock()
    var completed = false

    func finish(active: Bool?, errorCode: String? = nil) {
      lock.lock()
      if completed {
        lock.unlock()
        return
      }
      completed = true
      lock.unlock()

      connection.cancel()
      resolve([
        "active": active as Any,
        "source": active == nil ? "unavailable" : "measured",
        "confidence": active == true ? "high" : "medium",
        "devices": devices,
        "errorCode": errorCode as Any
      ])
    }

    connection.stateUpdateHandler = { state in
      switch state {
      case .ready:
        let payload = """
        M-SEARCH * HTTP/1.1\r
        HOST: 239.255.255.250:1900\r
        MAN: "ssdp:discover"\r
        MX: 1\r
        ST: upnp:rootdevice\r
        \r
        """
        connection.send(content: payload.data(using: .utf8), completion: .contentProcessed { error in
          if let error = error {
            finish(active: nil, errorCode: error.localizedDescription)
            return
          }
          self.receiveSsdp(connection: connection, devices: devices, lock: lock, finish: finish)
        })
      case .failed(let error):
        finish(active: nil, errorCode: error.localizedDescription)
      case .cancelled:
        break
      default:
        break
      }
    }

    connection.start(queue: queue)
    queue.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) {
      finish(active: devices.count > 0)
    }
  }

  private func probeTcpPort(
    host: String,
    port: Int,
    timeoutMs: Int,
    completion: @escaping ([String: Any]) -> Void
  ) {
    guard let nwPort = NWEndpoint.Port(rawValue: UInt16(port)) else {
      completion(tcpResult(host: host, port: port, state: "unknown", latencyMs: 0, errorCode: "invalid_port"))
      return
    }

    let startedAt = Date()
    let connection = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: .tcp)
    let lock = NSLock()
    var completed = false

    func finish(state: String, errorCode: String? = nil) {
      lock.lock()
      if completed {
        lock.unlock()
        return
      }
      completed = true
      lock.unlock()

      connection.cancel()
      let latencyMs = Int(Date().timeIntervalSince(startedAt) * 1000)
      completion(tcpResult(host: host, port: port, state: state, latencyMs: latencyMs, errorCode: errorCode))
    }

    connection.stateUpdateHandler = { state in
      switch state {
      case .ready:
        finish(state: "open")
      case .failed(let error):
        finish(state: "closed", errorCode: error.localizedDescription)
      case .waiting(let error):
        finish(state: "filtered", errorCode: error.localizedDescription)
      case .cancelled:
        break
      default:
        break
      }
    }

    connection.start(queue: queue)
    queue.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) {
      finish(state: "filtered", errorCode: "timeout")
    }
  }

  private func receiveSsdp(
    connection: NWConnection,
    devices: NSMutableArray,
    lock: NSLock,
    finish: @escaping (Bool?, String?) -> Void
  ) {
    connection.receiveMessage { data, _, _, error in
      if let error = error {
        finish(nil, error.localizedDescription)
        return
      }

      if let data = data, let text = String(data: Data(data.prefix(4096)), encoding: .utf8) {
        let headers = self.parseSsdpHeaders(text)
        if !headers.isEmpty {
          lock.lock()
          devices.add(headers)
          lock.unlock()
        }
      }

      self.receiveSsdp(connection: connection, devices: devices, lock: lock, finish: finish)
    }
  }

  private func parseSsdpHeaders(_ text: String) -> [String: String] {
    var result: [String: String] = [:]
    for line in text.components(separatedBy: "\r\n") {
      let parts = line.split(separator: ":", maxSplits: 1).map {
        $0.trimmingCharacters(in: .whitespacesAndNewlines)
      }
      guard parts.count == 2 else { continue }
      let key = parts[0].lowercased()
      if key == "location" || key == "server" || key == "usn" || key == "st" {
        result[key] = parts[1]
      }
    }
    return result
  }

  private func tcpResult(
    host: String,
    port: Int,
    state: String,
    latencyMs: Int,
    errorCode: String?
  ) -> [String: Any] {
    [
      "host": host,
      "port": port,
      "state": state,
      "latencyMs": latencyMs,
      "source": "measured",
      "errorCode": errorCode as Any
    ]
  }

  private func unavailableSsdp(errorCode: String) -> [String: Any] {
    [
      "active": NSNull(),
      "source": "unavailable",
      "confidence": "low",
      "devices": [],
      "errorCode": errorCode
    ]
  }
}
