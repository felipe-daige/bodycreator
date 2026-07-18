import XCTest
@testable import Figurinhas

final class APIClientTests: XCTestCase {
    override func tearDown() {
        URLProtocolStub.handler = nil
        super.tearDown()
    }

    func testSurfacesPortugueseServerError() async throws {
        URLProtocolStub.handler = { request in
            XCTAssertEqual(request.url?.path, "/packs")
            return (
                HTTPURLResponse(
                    url: request.url!, statusCode: 403, httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )!,
                Data(#"{"error":"Você não tem permissão para esta ação."}"#.utf8)
            )
        }
        let client = APIClient(baseURL: URL(string: "https://api.test")!, session: URLProtocolStub.session())

        do {
            let _: [AdminPack] = try await client.get("packs")
            XCTFail("Deveria lançar erro")
        } catch let error as APIError {
            XCTAssertEqual(
                error,
                .server(status: 403, message: "Você não tem permissão para esta ação.")
            )
        }
    }

    func testMultipartKeepsExactPNGBytes() {
        let png = Data([0x89, 0x50, 0x4E, 0x47, 0x00, 0xFF, 0x10, 0x00])
        let body = APIClient.multipartBody(
            fields: [("id", "seta-1"), ("name", "Seta")],
            file: MultipartFile(
                fieldName: "file", fileName: "seta.png", mimeType: "image/png", data: png
            ),
            boundary: "BOUNDARY"
        )

        XCTAssertNotNil(body.range(of: png))
        XCTAssertEqual(body.ranges(of: png).count, 1)
        XCTAssertTrue(String(decoding: body, as: UTF8.self).contains("name=\"id\""))
    }
}

private extension Data {
    func ranges(of needle: Data) -> [Range<Data.Index>] {
        var result: [Range<Data.Index>] = []
        var start = startIndex
        while start < endIndex, let range = self[start...].range(of: needle) {
            result.append(range)
            start = range.upperBound
        }
        return result
    }
}
