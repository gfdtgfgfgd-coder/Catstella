import AppKit
import CoreGraphics
import Foundation

// Arguments: args[1] = parent PID, args[2] = optional widget window handle / ID
let args = CommandLine.arguments
let parentPid = args.count > 1 ? Int32(args[1]) ?? 0 : 0

// Watch stdin in background thread so parent exit or detach stops helper immediately
Thread.detachNewThread {
    while let line = readLine() {
        if line.contains("detach") {
            exit(0)
        }
    }
    // stdin closed
    exit(0)
}

var trackedHostId: Int = 0
var restoreGeneration: Int = 0
var previousMessage: String = ""
var lastHeartbeat = Date()

while true {
    // Check if parent process is still alive
    if parentPid > 0 && kill(parentPid, 0) != 0 {
        break
    }

    let frontApp = NSWorkspace.shared.frontmostApplication
    let frontPid = frontApp?.processIdentifier ?? 0
    let frontName = frontApp?.localizedName ?? ""
    let frontBundle = frontApp?.bundleIdentifier ?? ""

    let isHostForeground = frontName.localizedCaseInsensitiveContains("Antigravity") || frontBundle.localizedCaseInsensitiveContains("antigravity")
    let isSelfForeground = parentPid > 0 && frontPid == parentPid

    let foregroundKind: String
    if isSelfForeground {
        foregroundKind = "self"
    } else if isHostForeground {
        foregroundKind = "host"
    } else if ["Finder", "Dock"].contains(frontName) {
        foregroundKind = "desktop"
    } else if ["Google Chrome", "Safari", "Arc", "Microsoft Edge", "Firefox", "Zen"].contains(frontName) {
        foregroundKind = "browser"
    } else {
        foregroundKind = "other"
    }

    let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    var bestWindow: [String: Any]? = nil
    var maxArea: Double = 0

    for w in windowList {
        guard let owner = w[kCGWindowOwnerName as String] as? String,
              owner.localizedCaseInsensitiveContains("Antigravity"),
              let layer = w[kCGWindowLayer as String] as? Int, layer == 0,
              let bounds = w[kCGWindowBounds as String] as? [String: Any],
              let width = bounds["Width"] as? Double, width > 300,
              let height = bounds["Height"] as? Double, height > 200 else {
            continue
        }
        let area = width * height
        if area > maxArea {
            maxArea = area
            bestWindow = w
        }
    }

    let message: String
    if let hw = bestWindow,
       let b = hw[kCGWindowBounds as String] as? [String: Any],
       let x = b["X"] as? Double, let y = b["Y"] as? Double,
       let w = b["Width"] as? Double, let h = b["Height"] as? Double,
       let id = hw[kCGWindowNumber as String] as? Int {
        if trackedHostId != id {
            trackedHostId = id
            restoreGeneration += 1
        }
        let boundsStr = "{\"x\":\(Int(round(x))),\"y\":\(Int(round(y))),\"width\":\(Int(round(w))),\"height\":\(Int(round(h)))}"
        message = "{\"foregroundKind\":\"\(foregroundKind)\",\"restoreGeneration\":\(restoreGeneration),\"kind\":\"host\",\"bounds\":\(boundsStr),\"attached\":true,\"widgetVisible\":true,\"hostId\":\"\(id)\",\"nativeFollowing\":false}"
    } else {
        let kind = isSelfForeground ? "self" : "other"
        message = "{\"foregroundKind\":\"\(foregroundKind)\",\"restoreGeneration\":\(restoreGeneration),\"kind\":\"\(kind)\",\"bounds\":null,\"attached\":false,\"widgetVisible\":false,\"hostId\":\"0\",\"nativeFollowing\":false}"
    }

    let now = Date()
    if message != previousMessage || now.timeIntervalSince(lastHeartbeat) >= 1.0 {
        print(message)
        fflush(stdout)
        previousMessage = message
        lastHeartbeat = now
    }

    Thread.sleep(forTimeInterval: 0.035) // ~30 FPS poll
}
