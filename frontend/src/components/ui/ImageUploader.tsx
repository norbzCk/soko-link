import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { apiRequest } from "../../lib/http";
import { resolveImageUrl } from "../../lib/format";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function ImageUploader({
  value,
  onChange,
  label = "Product photo",
  hint = "PNG, JPG, WEBP or GIF · up to 2MB",
  className = "",
}: {
  value?: string | null;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setError("");
    if (!ACCEPTED.includes(file.type)) {
      setError("Please choose a JPG, PNG, WEBP or GIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image is too large. Maximum size is 2MB.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await apiRequest<{ image_url: string }>("/products/upload-image", {
        method: "POST",
        body: formData,
      });
      onChange(data.image_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void upload(file);
  }

  return (
    <div className={`field ${className}`}>
      <span className="field-label">{label}</span>
      <div className="flex gap-3">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-soft">
          {value ? (
            <img src={resolveImageUrl(value)} alt="Preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
              <ImagePlus size={22} />
            </div>
          )}
          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : null}
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-3 text-center transition-colors ${
            dragging
              ? "border-brand bg-brand-light"
              : "border-border bg-surface-soft/60 hover:border-brand/50 hover:bg-surface-soft"
          } ${uploading ? "pointer-events-none opacity-70" : ""}`}
        >
          <UploadCloud size={20} className="text-brand" />
          <span className="text-xs font-semibold text-text">
            {uploading ? "Uploading…" : value ? "Replace photo" : "Click or drop an image"}
          </span>
          <span className="text-[11px] text-text-muted">{hint}</span>
        </div>

        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="icon-btn h-9 w-9 shrink-0 self-start !text-danger hover:!border-danger/30"
            aria-label="Remove photo"
            title="Remove photo"
          >
            <Trash2 size={15} />
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}
