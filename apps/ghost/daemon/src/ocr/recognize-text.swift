import Cocoa
import Vision

// 1. Get input path
guard CommandLine.arguments.count > 1 else {
    print("Usage: recognize-text <image-path>")
    exit(1)
}
let imagePath = CommandLine.arguments[1]

// 2. Load image
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("Error: Could not load image at \(imagePath)")
    exit(1)
}

// 3. Create request
let request = VNRecognizeTextRequest { (request, error) in
    guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
    
    let text = observations.compactMap { observation in
        observation.topCandidates(1).first?.string
    }.joined(separator: "\n")
    
    print(text)
}

// Configure for accuracy vs speed
request.recognitionLevel = .accurate // or .fast
request.usesLanguageCorrection = true

// 4. Perform request
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    print("Error: \(error)")
    exit(1)
}
