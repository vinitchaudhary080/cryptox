import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 116,
          background: "linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#a3e635",
          fontWeight: 700,
          letterSpacing: -4,
          borderRadius: 36,
        }}
      >
        A
      </div>
    ),
    { ...size },
  );
}
