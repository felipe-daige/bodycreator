import Foundation

/// Configuração da integração oficial "Sharing to Stories" do Instagram.
enum InstagramSharing {
    /// Facebook App ID exigido pela API oficial de Stories (obrigatório desde
    /// janeiro/2023). Sem ele, o Instagram recusa o compartilhamento.
    ///
    /// Como obter (grátis): crie um app em https://developers.facebook.com/apps,
    /// copie o número do "App ID" e cole abaixo. Enquanto estiver vazio, o botão
    /// "Usar no Instagram" avisa que a configuração está pendente.
    static let facebookAppID = ""
}
