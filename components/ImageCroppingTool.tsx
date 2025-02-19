"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import * as faceapi from "face-api.js"
import ReactCrop, { centerCrop, type Crop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import { Upload, Camera, CropIcon, Loader2, Menu, Scan } from "lucide-react"

const labeledImages = [
  { name: "black-widow", url: "/labeled-images/black-widow.jpeg" },
  { name: "captain-america", url: "/labeled-images/captain-america.avif" },
]

export default function ImageCroppingTool() {
  const [src, setSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [aspect, setAspect] = useState<number>(1)
  const imageRef = useRef<HTMLImageElement>(null)
  const [faceMatcher, setFaceMatcher] = useState<faceapi.FaceMatcher | null>(null)
  const [detections, setDetections] = useState<
    faceapi.WithFaceDescriptor<
      faceapi.WithFaceLandmarks<
        {
          detection: faceapi.FaceDetection
        },
        faceapi.FaceLandmarks68
      >
    >[]
  >([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isModelLoaded, setIsModelLoaded] = useState(false)
  const [modelLoadingError, setModelLoadingError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    const loadModelsAndCreateMatcher = async () => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri("/models")
        await faceapi.nets.faceLandmark68Net.loadFromUri("/models")
        await faceapi.nets.faceRecognitionNet.loadFromUri("/models")

        const labeledFaceDescriptors = await Promise.all(
          labeledImages.map(async (label) => {
            try {
              const img = await faceapi.fetchImage(label.url)
              const detection = await faceapi
                .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor()

              if (!detection) {
                throw new Error(`No face detected in ${label.name}`)
              }
              return new faceapi.LabeledFaceDescriptors(label.name, [detection.descriptor])
            } catch (error) {
              console.error(`Error processing ${label.name}:`, error)
              throw error
            }
          }),
        )

        const matcher = new faceapi.FaceMatcher(labeledFaceDescriptors)
        setFaceMatcher(matcher)
        setIsModelLoaded(true)
        setModelLoadingError(null)
      } catch (error) {
        console.error("Error loading models or creating face matcher:", error)
        setModelLoadingError(`Error loading models: ${error instanceof Error ? error.message : String(error)}`)
        setIsModelLoaded(false)
      }
    }

    loadModelsAndCreateMatcher()
  }, [])

  const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader()
      reader.addEventListener("load", () => setSrc(reader.result?.toString() || null))
      reader.readAsDataURL(e.target.files[0])
    }
  }

  const onImageLoad = useCallback(
    async (img: HTMLImageElement) => {
      if (!isModelLoaded) return

      try {
        setIsProcessing(true)
        const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions())
        if (detections.length > 0) {
          const face = detections[0]
          const { x, y, width, height } = face.box

          const centerX = x + width / 2
          const centerY = y + height / 2

          let cropWidth, cropHeight
          if (aspect >= 1) {
            cropWidth = width * 2
            cropHeight = cropWidth / aspect
          } else {
            cropHeight = height * 2
            cropWidth = cropHeight * aspect
          }

          const cropX = Math.max(centerX - cropWidth / 2, 0)
          const cropY = Math.max(centerY - cropHeight / 2, 0)
          const finalCropWidth = Math.min(cropWidth, img.width - cropX)
          const finalCropHeight = Math.min(cropHeight, img.height - cropY)
          const crop: any = {
            unit: "%",
            width: (finalCropWidth / img.width) * 100,
            height: (finalCropHeight / img.height) * 100,
            x: (cropX / img.width) * 100,
            y: (cropY / img.height) * 100,
            aspect,
          }
          const centeredCrop: any = centerCrop(crop, img.width, img.height)
          setCrop(centeredCrop)
        }
      } catch (error) {
        console.error("Error detecting faces:", error)
      } finally {
        setIsProcessing(false)
      }
    },
    [aspect, isModelLoaded],
  )

  const getCroppedImg = useCallback(() => {
    if (!crop || !imageRef.current) return

    const canvas = document.createElement("canvas")
    const scaleX = imageRef.current.naturalWidth / imageRef.current.width
    const scaleY = imageRef.current.naturalHeight / imageRef.current.height
    canvas.width = crop.width
    canvas.height = crop.height
    const ctx = canvas.getContext("2d")

    if (ctx) {
      ctx.drawImage(
        imageRef.current,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        crop.width,
        crop.height,
      )

      canvas.toBlob((blob) => {
        if (!blob) {
          console.error("Canvas is empty")
          return
        }
        const previewUrl = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.download = "cropped-image.png"
        link.href = previewUrl
        link.click()
      }, "image/png")
    }
  }, [crop])

  const detectFaces = async () => {
    if (!imageRef.current || !canvasRef.current || !faceMatcher || !isModelLoaded) return

    try {
      setIsProcessing(true)
      const detections = await faceapi
        .detectAllFaces(imageRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors()

      setDetections(detections)

      faceapi.matchDimensions(canvasRef.current, imageRef.current)

      const resizedDetections = faceapi.resizeResults(detections, {
        width: imageRef.current.width,
        height: imageRef.current.height,
      })

      const ctx = canvasRef.current.getContext("2d")
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }

      resizedDetections.forEach((detection) => {
        const bestMatch = faceMatcher.findBestMatch(detection.descriptor)
        const box = detection.detection.box
        const drawBox = new faceapi.draw.DrawBox(box, {
          label: bestMatch.toString(),
        })
        drawBox.draw(canvasRef.current as HTMLCanvasElement)
      })
    } catch (error) {
      console.error("Error detecting faces:", error)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-gray-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <span className="font-bold text-xl">FaceCrop AI</span>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <a href="#" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700">
                  Home
                </a>
                <a href="#" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700">
                  About
                </a>
                <a href="#" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700">
                  Contact
                </a>
              </div>
            </div>
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              <a href="#" className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700">
                Home
              </a>
              <a href="#" className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700">
                About
              </a>
              <a href="#" className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700">
                Contact
              </a>
            </div>
          </div>
        )}
      </nav>

      <header className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center mb-4">
              <Scan className="w-10 h-10 mr-3" />
              <h1 className="text-4xl font-extrabold tracking-tight">Image Cropping & Face Recognition Tool</h1>
            </div>
            <div className="max-w-3xl mx-auto">
              <p className="mt-4 text-xl text-gray-100">
                Upload any image to crop it perfectly or detect faces. Our AI can recognize Chris Evans as Captain
                America and Scarlett Johansson as Black Widow!
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
                <span className="px-4 py-2 bg-white/10 rounded-full backdrop-blur-sm">Automatic Face Detection</span>
                <span className="px-4 py-2 bg-white/10 rounded-full backdrop-blur-sm">Smart Cropping</span>
                <span className="px-4 py-2 bg-white/10 rounded-full backdrop-blur-sm">Celebrity Recognition</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          {modelLoadingError ? (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
              <p className="font-bold">Error loading models</p>
              <p>{modelLoadingError}</p>
            </div>
          ) : !isModelLoaded ? (
            <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-6" role="alert">
              <p className="font-bold">Loading face recognition models...</p>
              <p>Please wait while we set things up for you.</p>
            </div>
          ) : null}

          <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <label className="flex items-center justify-center w-full sm:w-auto px-4 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 transition-colors">
              <Upload className="w-5 h-5 mr-2" />
              Upload Image
              <input type="file" accept="image/*" onChange={onSelectFile} className="hidden" />
            </label>
            <select
              onChange={(e) => setAspect(Number.parseFloat(e.target.value))}
              className="w-full sm:w-auto px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              defaultValue="1"
            >
              <option value="1">1:1 (Square)</option>
              <option value="0.8">4:5 (Portrait)</option>
              <option value="1.77778">16:9 (Landscape)</option>
            </select>
          </div>

          {src && (
            <div className="mb-8">
              <ReactCrop crop={crop} onChange={(c) => setCrop(c)} aspect={aspect}>
                <Image
                  ref={imageRef}
                  src={src || "/placeholder.svg"}
                  alt="Uploaded image"
                  width={800}
                  height={600}
                  onLoad={(e) => onImageLoad(e.target as HTMLImageElement)}
                  className="max-w-full h-auto rounded-lg shadow-lg"
                />
              </ReactCrop>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-4 mb-8">
            {crop && (
              <button
                onClick={getCroppedImg}
                className="flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                disabled={isProcessing}
              >
                <CropIcon className="w-5 h-5 mr-2" />
                Crop & Download
              </button>
            )}
            {src && isModelLoaded && (
              <button
                onClick={detectFaces}
                className="flex items-center px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                disabled={isProcessing}
              >
                <Camera className="w-5 h-5 mr-2" />
                Detect Faces
              </button>
            )}
            {isProcessing && (
              <div className="flex items-center text-gray-600">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Processing...
              </div>
            )}
          </div>

          {src && isModelLoaded && (
            <>
              <canvas ref={canvasRef} className="mx-auto mb-8 rounded-lg shadow-lg hidden" />
              <div className="bg-gray-100 p-6 rounded-lg shadow">
                <h2 className="text-xl font-bold mb-4 text-gray-800">Detected Faces:</h2>
                {detections.length > 0 ? (
                  <ul className="list-disc list-inside">
                    {detections.map((detection, index) => {
                      const bestMatch = faceMatcher?.findBestMatch(detection.descriptor)
                      return (
                        <li key={index} className="mb-2 text-green-700 text-2xl text-bold ">
                          Face {index + 1}: {bestMatch?.toString()}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-gray-600">
                    No faces detected yet. Try uploading an image and clicking "Detect Faces".
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="bg-gray-800 text-white">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <p>&copy; 2025 FaceCrop AI. All rights reserved.</p>
            </div>
            <div>
              <a href="#" className="text-gray-300 hover:text-white mr-4">
                Privacy Policy
              </a>
              <a href="#" className="text-gray-300 hover:text-white mr-4">
                Terms of Service
              </a>
              <a href="#" className="text-gray-300 hover:text-white">
                Contact Us
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

