import XCTest

final class BodyCreatoUITests: XCTestCase {
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

        let copyOnlyButton = app.buttons["copy-only"]
        XCTAssertTrue(copyOnlyButton.waitForExistence(timeout: 5))
        copyOnlyButton.tap()
        XCTAssertTrue(
            app.staticTexts["Copiado! Agora é só colar onde quiser."].waitForExistence(timeout: 3)
        )

        app.buttons["copy-and-open-instagram"].tap()
        let missingInstagramAlert = app.alerts["Instale o Instagram para usar as figurinhas"]
        XCTAssertTrue(missingInstagramAlert.waitForExistence(timeout: 3))
        missingInstagramAlert.buttons["Cancelar"].tap()

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
    }

    @MainActor
    private func finishOnboardingIfNeeded(in app: XCUIApplication) {
        guard app.staticTexts["Body Creato"].waitForExistence(timeout: 2) else {
            return
        }

        app.buttons["Próximo"].tap()
        app.buttons["Próximo"].tap()
        app.buttons["Começar"].tap()
    }
}
