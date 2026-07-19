import XCTest
import StoreKitTest

final class BodyCreatorUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testCoreStickerFlow() throws {
        let app = XCUIApplication()
        app.launch()

        finishOnboardingIfNeeded(in: app)

        XCTAssertTrue(app.navigationBars["Pacotes"].waitForExistence(timeout: 5))

        let examplePack = app.descendants(matching: .any)["pack-exemplo"]
        XCTAssertTrue(examplePack.waitForExistence(timeout: 5))
        examplePack.tap()

        XCTAssertTrue(app.navigationBars["Pacote de Exemplo"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["sticker-seta-reta"].waitForExistence(timeout: 5))
        app.buttons["sticker-seta-reta"].tap()

        XCTAssertTrue(app.buttons["take-photo"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["pick-from-gallery"].exists)

        let copyOnlyButton = app.buttons["copy-only"]
        XCTAssertTrue(copyOnlyButton.waitForExistence(timeout: 5))
        copyOnlyButton.tap()
        XCTAssertTrue(
            app.staticTexts["Agora é só colar onde quiser: toque e segure e escolha Colar."]
                .waitForExistence(timeout: 3)
        )

        let favoriteButton = app.buttons["favorite-toggle"]
        XCTAssertTrue(favoriteButton.waitForExistence(timeout: 3))
        if favoriteButton.label == "Adicionar aos favoritos" {
            favoriteButton.tap()
        }

        let detailScreenshot = XCTAttachment(screenshot: app.screenshot())
        detailScreenshot.name = "Detalhe da figurinha"
        detailScreenshot.lifetime = .keepAlways
        add(detailScreenshot)

        app.buttons["close-sticker-detail"].tap()
        app.tabBars.buttons["Favoritos"].tap()

        XCTAssertTrue(app.navigationBars["Favoritos"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["favorite-sticker-seta-reta"].waitForExistence(timeout: 5))

        let favoritesScreenshot = XCTAttachment(screenshot: app.screenshot())
        favoritesScreenshot.name = "Grade de favoritos"
        favoritesScreenshot.lifetime = .keepAlways
        add(favoritesScreenshot)

        // As duas origens de foto também estão acessíveis a partir dos favoritos.
        app.buttons["favorite-sticker-seta-reta"].tap()
        XCTAssertTrue(app.buttons["take-photo"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["pick-from-gallery"].exists)
    }

    @MainActor
    func testSettingsAreDesignedForARegularUser() throws {
        let app = XCUIApplication()
        app.launch()
        finishOnboardingIfNeeded(in: app)

        app.tabBars.buttons["Configurações"].tap()
        signOutIfNeeded(in: app)

        XCTAssertTrue(app.navigationBars["Configurações"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["settings-refresh"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["settings-login"].exists)
        XCTAssertFalse(app.staticTexts["Área administrativa"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["owner-content-management"].exists)
    }

    @MainActor
    func testStoreOffersPurchaseRestoration() throws {
        let app = XCUIApplication()
        app.launch()
        finishOnboardingIfNeeded(in: app)

        app.tabBars.buttons["Loja"].tap()

        XCTAssertTrue(app.navigationBars["Loja"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["restore-purchases"].exists)

        let storeScreenshot = XCTAttachment(screenshot: app.screenshot())
        storeScreenshot.name = "Loja"
        storeScreenshot.lifetime = .keepAlways
        add(storeScreenshot)
    }

    @MainActor
    func testLocalStoreKitPurchaseUnlocksPremiumPack() throws {
        let session = try SKTestSession(configurationFileNamed: "BodyCreator")
        session.disableDialogs = true
        session.clearTransactions()
        defer { session.clearTransactions() }

        let app = XCUIApplication()
        app.launch()
        finishOnboardingIfNeeded(in: app)
        app.tabBars.buttons["Loja"].tap()

        let buyButton = app.buttons["buy-premium-exemplo"]
        XCTAssertTrue(buyButton.waitForExistence(timeout: 8))
        buyButton.tap()

        XCTAssertTrue(app.staticTexts["Comprado"].waitForExistence(timeout: 8))
    }

    @MainActor
    func testLiveAdminLoginWhenCredentialsAreProvided() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let email = environment["E2E_ADMIN_EMAIL"],
              let password = environment["E2E_ADMIN_PASSWORD"] else {
            throw XCTSkip("Credenciais locais não fornecidas.")
        }

        let app = XCUIApplication()
        app.launchEnvironment["BODYCREATOR_API_URL"] =
            environment["E2E_API_URL"] ?? "http://127.0.0.1:3000"
        app.launch()
        finishOnboardingIfNeeded(in: app)
        app.tabBars.buttons["Configurações"].tap()
        let accountLink = app.descendants(matching: .any)["settings-login"]
        XCTAssertTrue(accountLink.waitForExistence(timeout: 5))
        accountLink.tap()

        let emailField = app.textFields["account-email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 5))
        emailField.tap()
        emailField.typeText(email)
        let passwordField = app.secureTextFields["account-password"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["account-login"].tap()

        XCTAssertTrue(app.staticTexts["Troque sua senha"].waitForExistence(timeout: 8))
    }

    @MainActor
    private func finishOnboardingIfNeeded(in app: XCUIApplication) {
        guard app.staticTexts["Body Creator"].waitForExistence(timeout: 2) else {
            return
        }

        app.buttons["Próximo"].tap()
        app.buttons["Próximo"].tap()
        app.buttons["Começar"].tap()
    }

    @MainActor
    private func signOutIfNeeded(in app: XCUIApplication) {
        if app.buttons["Sair"].waitForExistence(timeout: 2) {
            app.buttons["Sair"].tap()
            return
        }

        let account = app.descendants(matching: .any)["settings-account"]
        guard account.exists else { return }
        account.tap()
        if app.buttons["Sair"].waitForExistence(timeout: 2) {
            app.buttons["Sair"].tap()
        }
    }
}
