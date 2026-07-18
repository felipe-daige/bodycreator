import SwiftUI

struct OnboardingView: View {
    let onFinish: () -> Void

    @State private var page = 0

    private let steps: [(icon: String, title: String, text: String)] = [
        (
            "hand.tap",
            "Escolha a figurinha",
            "Navegue pelos pacotes e toque na figurinha que você quer usar."
        ),
        (
            "photo.on.rectangle.angled",
            "Escolha a foto",
            "Toque em “Usar no Instagram” e selecione a foto já tirada do paciente."
        ),
        (
            "checkmark.seal",
            "Ajuste e publique",
            "O Instagram abre com a foto de fundo e a figurinha por cima. Arraste para posicionar e publique."
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
