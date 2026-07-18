#!/usr/bin/env swift
// Gera figurinhas placeholder (PNG 1024x1024 com alfa) em Content/packs/exemplo.
// Uso: swift Scripts/generate_placeholders.swift [dirConteudo]
import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

let side = 1024
let contentDir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "Content")
let packDir = contentDir.appendingPathComponent("packs/exemplo", isDirectory: true)
try FileManager.default.createDirectory(at: packDir, withIntermediateDirectories: true)

let roxo = CGColor(red: 0.45, green: 0.20, blue: 0.75, alpha: 1)
let branco = CGColor(red: 1, green: 1, blue: 1, alpha: 1)

func makeContext() -> CGContext {
    CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
              space: CGColorSpace(name: CGColorSpace.sRGB)!,
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
}

func save(_ ctx: CGContext, _ name: String) {
    let url = packDir.appendingPathComponent(name)
    let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    CGImageDestinationFinalize(dest)
    print("gerado: \(url.path)")
}

func drawCenteredText(_ text: String, size fontSize: CGFloat, color: CGColor, at center: CGPoint, in ctx: CGContext) {
    let font = CTFontCreateWithName("HelveticaNeue-Bold" as CFString, fontSize, nil)
    let attr = NSAttributedString(string: text, attributes: [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
    ])
    let line = CTLineCreateWithAttributedString(attr)
    var ascent: CGFloat = 0, descent: CGFloat = 0
    let width = CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, nil))
    ctx.textPosition = CGPoint(x: center.x - width / 2, y: center.y - (ascent - descent) / 2)
    CTLineDraw(line, ctx)
}

func arrow(rotation: CGFloat, name: String) {
    let ctx = makeContext()
    ctx.translateBy(x: 512, y: 512)
    ctx.rotate(by: rotation)
    let path = CGMutablePath()
    path.move(to: CGPoint(x: -380, y: 0))
    path.addLine(to: CGPoint(x: 340, y: 0))
    path.move(to: CGPoint(x: 180, y: 160))
    path.addLine(to: CGPoint(x: 340, y: 0))
    path.addLine(to: CGPoint(x: 180, y: -160))
    ctx.addPath(path)
    ctx.setStrokeColor(roxo)
    ctx.setLineWidth(70)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.strokePath()
    save(ctx, name)
}

func circleOutline(name: String) {
    let ctx = makeContext()
    ctx.setStrokeColor(roxo)
    ctx.setLineWidth(60)
    ctx.strokeEllipse(in: CGRect(x: 90, y: 90, width: 844, height: 844))
    save(ctx, name)
}

func badge(_ text: String, name: String) {
    let ctx = makeContext()
    let rect = CGRect(x: 42, y: 362, width: 940, height: 300)
    ctx.addPath(CGPath(roundedRect: rect, cornerWidth: 150, cornerHeight: 150, transform: nil))
    ctx.setFillColor(roxo)
    ctx.fillPath()
    drawCenteredText(text, size: 150, color: branco, at: CGPoint(x: rect.midX, y: rect.midY), in: ctx)
    save(ctx, name)
}

func cover(name: String) {
    let ctx = makeContext()
    ctx.addPath(CGPath(roundedRect: CGRect(x: 32, y: 32, width: 960, height: 960),
                       cornerWidth: 180, cornerHeight: 180, transform: nil))
    ctx.setFillColor(roxo)
    ctx.fillPath()
    drawCenteredText("Aa", size: 420, color: branco, at: CGPoint(x: 512, y: 512), in: ctx)
    save(ctx, name)
}

arrow(rotation: 0, name: "seta-reta.png")
arrow(rotation: .pi / 2, name: "seta-cima.png")
circleOutline(name: "circulo.png")
badge("ANTES", name: "badge-antes.png")
badge("DEPOIS", name: "badge-depois.png")
badge("RESULTADO", name: "badge-resultado.png")
cover(name: "cover.png")
print("concluído: 7 arquivos")
