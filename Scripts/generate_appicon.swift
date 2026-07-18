#!/usr/bin/env swift
// Gera o ícone provisório do Body Creator (1024x1024, sem alfa) e a cor de destaque.
import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

let assetsDirectory = URL(fileURLWithPath: "App/Assets.xcassets", isDirectory: true)
let iconDirectory = assetsDirectory.appendingPathComponent("AppIcon.appiconset", isDirectory: true)
let accentDirectory = assetsDirectory.appendingPathComponent("AccentColor.colorset", isDirectory: true)

try FileManager.default.createDirectory(at: iconDirectory, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: accentDirectory, withIntermediateDirectories: true)

let side = 1024
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let context = CGContext(
    data: nil,
    width: side,
    height: side,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
)!

let colors = [
    CGColor(red: 0.24, green: 0.08, blue: 0.42, alpha: 1),
    CGColor(red: 0.67, green: 0.24, blue: 0.58, alpha: 1),
] as CFArray
let gradient = CGGradient(
    colorsSpace: colorSpace,
    colors: colors,
    locations: [0, 1]
)!
context.drawLinearGradient(
    gradient,
    start: CGPoint(x: 120, y: 100),
    end: CGPoint(x: 900, y: 930),
    options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
)

context.setStrokeColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.22))
context.setLineWidth(26)
context.strokeEllipse(in: CGRect(x: 118, y: 118, width: 788, height: 788))

let font = CTFontCreateWithName("HelveticaNeue-Bold" as CFString, 330, nil)
let attributes = NSAttributedString(
    string: "BC",
    attributes: [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String):
            CGColor(red: 1, green: 1, blue: 1, alpha: 1),
    ]
)
let line = CTLineCreateWithAttributedString(attributes)
var ascent: CGFloat = 0
var descent: CGFloat = 0
let width = CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, nil))
context.textPosition = CGPoint(
    x: CGFloat(side) / 2 - width / 2,
    y: CGFloat(side) / 2 - (ascent - descent) / 2
)
CTLineDraw(line, context)

let iconURL = iconDirectory.appendingPathComponent("AppIcon.png")
let destination = CGImageDestinationCreateWithURL(
    iconURL as CFURL,
    UTType.png.identifier as CFString,
    1,
    nil
)!
CGImageDestinationAddImage(destination, context.makeImage()!, nil)
guard CGImageDestinationFinalize(destination) else {
    fatalError("Não foi possível salvar o ícone")
}

let rootContents = """
{
  "info" : { "author" : "xcode", "version" : 1 }
}
"""
let iconContents = """
{
  "images" : [
    { "filename" : "AppIcon.png", "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
"""
let accentContents = """
{
  "colors" : [
    {
      "color" : {
        "color-space" : "srgb",
        "components" : {
          "alpha" : "1.000",
          "blue" : "0.580",
          "green" : "0.240",
          "red" : "0.670"
        }
      },
      "idiom" : "universal"
    }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
"""

try rootContents.write(
    to: assetsDirectory.appendingPathComponent("Contents.json"),
    atomically: true,
    encoding: .utf8
)
try iconContents.write(
    to: iconDirectory.appendingPathComponent("Contents.json"),
    atomically: true,
    encoding: .utf8
)
try accentContents.write(
    to: accentDirectory.appendingPathComponent("Contents.json"),
    atomically: true,
    encoding: .utf8
)

print("Ícone provisório gerado em \(iconURL.path)")
