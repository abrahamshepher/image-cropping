import { NextResponse } from "next/server";
import { RekognitionClient, DetectFacesCommand } from "@aws-sdk/client-rekognition";

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: Request) {
  try {
    const { image } = await request.json();

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), "base64");

    // Detect faces using AWS Rekognition
    const command = new DetectFacesCommand({
      Image: { Bytes: buffer },
      Attributes: ["DEFAULT"],
    });

    const response = await rekognition.send(command);

    if (response.FaceDetails && response.FaceDetails.length > 0) {
      const face = response.FaceDetails[0].BoundingBox;

      if (face) {
        return NextResponse.json({
          success: true,
          faceBoundingBox: {
            x: face.Left,
            y: face.Top,
            width: face.Width,
            height: face.Height,
          },
        });
      }
    }

    return NextResponse.json({ error: "No faces detected" }, { status: 404 });
  } catch (error) {
    console.error("Error detecting face:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
