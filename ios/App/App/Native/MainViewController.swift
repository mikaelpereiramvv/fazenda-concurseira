import UIKit
import Capacitor

/// Bridge principal do app. Registra os plugins locais (que não vêm do npm).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FocoGuardPlugin())
    }
}
