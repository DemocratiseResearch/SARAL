import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#111111",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "40px",
      }}
    >
      <span
        style={{
          color: "#f5f4f0",
          fontSize: 108,
          fontWeight: 700,
          fontFamily: "Georgia, serif",
          lineHeight: 1,
          marginTop: "8px",
        }}
      >
        S
      </span>
    </div>,
    { ...size },
  );
}
