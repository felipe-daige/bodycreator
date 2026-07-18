import SwiftUI

struct OnboardingView: View {
    let onFinish: () -> Void

    @State private var page = 0

    private let steps: [(icon: String, title: String, text: String)] = [
        (
            "hand.tap",
            "Escolha a figurinha",
            "Navegue pelos pacotes, toque na figurinha e depois em “Copiar e abrir Instagram”."
        ),
        (
            "camera",
            "Monte seu story",
            "No Instagram, crie o story normalmente com a foto que quiser."
        ),
        (
            "doc.on.clipboard",
            "Cole a figurinha",
            "Toque e segure na tela do story e escolha Colar. Depois, posicione e redimensione."
        ),
    ]

    var body: some View {
        VStack(spacing: 0) {
            Text("Body Creator")
                .font(.title.bold())
                .padding(.top, 32)

            TabView(selection: $page) {
                ForEach(steps.indices, id: \.self) { index in
                    VStack(spacing: 24) {
                        Image(systemName: steps[index].icon)
                            .font(.system(size: 72))
                            .foregroundStyle(Color.accentColor)
                            .accessibilityHidden(true)
                        Text(steps[index].title)
                            .font(.title2.bold())
                        Text(steps[index].text)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.secondary)
                    }
                    .padding(32)
                    .tag(index)
                }
            }
            .tabViewStyle(.page)
            .indexViewStyle(.page(backgroundDisplayMode: .always))

            Button {
                if page < steps.count - 1 {
                    withAnimation {
                        page += 1
                    }
                } else {
                    onFinish()
                }
            } label: {
                Text(page < steps.count - 1 ? "Próximo" : "Começar")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding([.horizontal, .bottom], 32)
        }
    }
}
