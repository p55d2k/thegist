import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "The Gist - AI News Brief";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0F172A",
          backgroundImage:
            "radial-gradient(circle at 25% 25%, rgba(99, 102, 241, 0.2) 0%, transparent 55%), radial-gradient(circle at 75% 75%, rgba(124, 58, 237, 0.2) 0%, transparent 55%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px",
          }}
        >
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 24,
              background: "linear-gradient(135deg, #4F46E5, #7C3AED)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 72,
              fontWeight: 700,
              color: "white",
              marginBottom: 40,
            }}
          >
            G
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "white",
              textAlign: "center",
              marginBottom: 24,
              maxWidth: 900,
              fontFamily: "Space Grotesk",
            }}
          >
            News for people who actually have lives.
          </div>
          <div
            style={{
              fontSize: 32,
              color: "#94A3B8",
              textAlign: "center",
              maxWidth: 800,
              fontFamily: "Inter",
            }}
          >
            5-minute AI news brief • 100+ sources • Zero BS
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
