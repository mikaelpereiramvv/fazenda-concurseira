import Foundation
import AppIntents

/// Ação do app Atalhos: "Sessão de estudo está ativa?"
/// Lê o valor gravado pelo JS via @capacitor/preferences
/// (o plugin salva no UserDefaults com o prefixo "CapacitorStorage.").
@available(iOS 16.0, *)
struct SessaoAtivaIntent: AppIntent {
    static let title: LocalizedStringResource = "Sessão de estudo está ativa?"
    static let description = IntentDescription(
        "Retorna verdadeiro quando há uma sessão de estudo em andamento na Fazenda Concurseira."
    )
    static let openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ReturnsValue<Bool> {
        let valor = UserDefaults.standard.string(forKey: "CapacitorStorage.sessaoAtiva")
        return .result(value: valor == "true")
    }
}
