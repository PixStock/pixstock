"use client";

export function SkipLink({ label }: { label: string }) {
  return (
    <a
      className="btn"
      href="#main"
      style={{ position: "absolute", left: "-9999px", top: 0 }}
      onFocus={(e) => {
        e.currentTarget.style.left = "12px";
        e.currentTarget.style.top = "12px";
        e.currentTarget.style.zIndex = "99";
      }}
      onBlur={(e) => {
        e.currentTarget.style.left = "-9999px";
      }}
    >
      {label}
    </a>
  );
}
