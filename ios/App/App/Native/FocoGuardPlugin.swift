import Foundation
import UIKit
import UserNotifications
import Capacitor

/// FocoGuard: detecta se o usuário saiu do app durante a sessão
/// e diferencia "trocou de app" de "bloqueou a tela".
///
/// Fluxo:
///  - JS chama `arm({ graceSeconds, warn })` ao iniciar a sessão e `disarm()` ao encerrar.
///  - Ao sair do app, o plugin pede um background task (~30 s de vida extra),
///    agenda um aviso local e escuta o evento de bloqueio de tela.
///  - Se a tela foi bloqueada, o aviso é cancelado e a ausência não é punida.
///  - Ao voltar, JS chama `report()` e decide a punição (regras ficam no domínio TS).
///
/// Uso de "com.apple.springboard.lockcomplete" (notificação Darwin): aceitável
/// porque o app é instalado por sideload e nunca passará pela revisão da App Store.
@objc(FocoGuardPlugin)
public class FocoGuardPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FocoGuardPlugin"
    public let jsName = "FocoGuard"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "arm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "report", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setKeepAwake", returnType: CAPPluginReturnPromise)
    ]

    private static let avisoId = "foco-aviso-saida"

    private var armed = false
    private var graceSeconds: Double = 15
    private var warn = true
    private var leftAt: Date?
    private var lockedWhileAway = false
    private var lastAwaySeconds: Double = 0
    private var lastLocked = false
    private var hasReport = false
    private var bgTask: UIBackgroundTaskIdentifier = .invalid

    override public func load() {
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(onResignActive),
                       name: UIApplication.willResignActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(onDidEnterBackground),
                       name: UIApplication.didEnterBackgroundNotification, object: nil)
        nc.addObserver(self, selector: #selector(onBecameActive),
                       name: UIApplication.didBecomeActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(onProtectedDataGone),
                       name: UIApplication.protectedDataWillBecomeUnavailableNotification, object: nil)

        let darwin = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = UnsafeRawPointer(Unmanaged.passUnretained(self).toOpaque())
        CFNotificationCenterAddObserver(
            darwin,
            observer,
            { _, observer, _, _, _ in
                guard let observer = observer else { return }
                let me = Unmanaged<FocoGuardPlugin>.fromOpaque(observer).takeUnretainedValue()
                DispatchQueue.main.async { me.markLocked() }
            },
            "com.apple.springboard.lockcomplete" as CFString,
            nil,
            .deliverImmediately
        )
    }

    // MARK: - API JS

    @objc func arm(_ call: CAPPluginCall) {
        graceSeconds = call.getDouble("graceSeconds") ?? 15
        warn = call.getBool("warn") ?? true
        armed = true
        hasReport = false
        call.resolve()
    }

    @objc func disarm(_ call: CAPPluginCall) {
        armed = false
        cancelWarning()
        call.resolve()
    }

    /// Relatório da última ausência (consumido uma única vez).
    @objc func report(_ call: CAPPluginCall) {
        let result: [String: Any] = [
            "hasAbsence": hasReport,
            "awaySeconds": lastAwaySeconds,
            "locked": lastLocked
        ]
        hasReport = false
        call.resolve(result)
    }

    /// Abre URLs externas (ex.: shortcuts://x-callback-url/run-shortcut?...).
    @objc func openUrl(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw) else {
            call.reject("URL inválida")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { ok in
                call.resolve(["opened": ok])
            }
        }
    }

    /// Mantém a tela acesa (modo relógio de mesa).
    @objc func setKeepAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
            call.resolve()
        }
    }

    // MARK: - Ciclo de vida

    @objc private func onResignActive() {
        guard armed else { return }
        leftAt = Date()
        lockedWhileAway = false
    }

    @objc private func onDidEnterBackground() {
        guard armed else { return }
        if leftAt == nil { leftAt = Date() }
        beginBackgroundTask()
        scheduleWarning()
    }

    @objc private func onBecameActive() {
        guard let left = leftAt else { return }
        lastAwaySeconds = Date().timeIntervalSince(left)
        lastLocked = lockedWhileAway
        hasReport = true
        leftAt = nil
        cancelWarning()
        endBackgroundTask()
        notifyListeners("returned", data: [
            "awaySeconds": lastAwaySeconds,
            "locked": lastLocked
        ])
    }

    @objc private func onProtectedDataGone() {
        markLocked()
    }

    private func markLocked() {
        guard leftAt != nil else { return }
        lockedWhileAway = true
        cancelWarning()
    }

    // MARK: - Aviso local e background task

    private func scheduleWarning() {
        guard warn else { return }
        let content = UNMutableNotificationContent()
        content.title = "Volte para a fazenda! 🌽"
        content.body = "Sua plantação murcha se você não voltar em alguns segundos."
        content.sound = .default
        // Pequeno atraso: dá tempo do evento de bloqueio de tela chegar e cancelar o aviso.
        let delay = max(2.0, min(4.0, graceSeconds / 3.0))
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
        let req = UNNotificationRequest(identifier: FocoGuardPlugin.avisoId, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    }

    private func cancelWarning() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [FocoGuardPlugin.avisoId])
        center.removeDeliveredNotifications(withIdentifiers: [FocoGuardPlugin.avisoId])
    }

    private func beginBackgroundTask() {
        endBackgroundTask()
        bgTask = UIApplication.shared.beginBackgroundTask(withName: "FocoGuard") { [weak self] in
            self?.endBackgroundTask()
        }
    }

    private func endBackgroundTask() {
        if bgTask != .invalid {
            UIApplication.shared.endBackgroundTask(bgTask)
            bgTask = .invalid
        }
    }
}
