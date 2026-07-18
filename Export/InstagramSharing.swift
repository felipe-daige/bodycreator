import Foundation

/// Configuração da integração oficial "Sharing to Stories" do Instagram.
enum InstagramSharing {
    /// Facebook App ID exigido pela API oficial de Stories (obrigatório desde
    /// janeiro/2023). Sem ele, o Instagram recusa o compartilhamento.
    ///
    /// Como obter (grátis): crie um app em https://developers.facebook.com/apps,
    /// copie o número do "App ID" e cole abaixo. Enquanto estiver vazio, o botão
    /// "Usar no Instagram" avisa que a configuração está pendente.
    ///
    /// Identificador público (embutido no app, vai na URL de compartilhamento) —
    /// não confundir com a Chave Secreta do app, que nunca entra no código.
    static let facebookAppID = "810447382061741"
}
