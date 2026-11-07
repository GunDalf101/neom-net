import clsx from "clsx";
import { useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { fileToPortrait } from "@/lib/image";
import { toast } from "@/store/ui";

/** Portrait with a futuristic placeholder when no image is set. */
export function Portrait({ url, name, size = 96, className }: { url: string | null; name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={clsx("hud-clip-sm relative shrink-0 overflow-hidden border border-line-2 bg-bg-2", className)} style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgba(25,227,255,0.25),transparent_60%)]">
          <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full opacity-40" fill="none" stroke="var(--color-cyan)" strokeWidth="1">
            <circle cx="32" cy="24" r="11" />
            <path d="M12 60c2-14 10-20 20-20s18 6 20 20" />
            <path d="M8 8h12M8 8v12M56 8H44M56 8v12M8 56v-12M56 56v-12" />
          </svg>
          <span className="relative font-display text-lg font-bold tracking-widest text-cyan">{initials}</span>
        </div>
      )}
      <div className="hud-scan" />
    </div>
  );
}

/**
 * Portrait with an upload control: tap the camera button (or drop an image on it) to replace the
 * picture. Images are downscaled in the browser before upload, so phone photos of any size work.
 */
export function PortraitPicker({
  url,
  name,
  size = 96,
  className,
  busy,
  onChange,
}: {
  url: string | null;
  name: string;
  size?: number;
  className?: string;
  busy?: boolean;
  onChange: (dataUrl: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [over, setOver] = useState(false);
  const pending = busy || working;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setWorking(true);
    try {
      onChange(await fileToPortrait(file));
    } catch (e) {
      toast("error", "Portrait not updated", e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div
      className={clsx("relative shrink-0", over && "outline outline-2 outline-cyan")}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void pick(e.dataTransfer.files?.[0]);
      }}
    >
      <Portrait url={url} name={name} size={size} className={className} />
      <div className="absolute bottom-1 right-1 flex gap-1">
        {url && (
          <button type="button" disabled={pending} onClick={() => onChange(null)} className="flex h-8 w-8 items-center justify-center border border-line-2 bg-bg-0/85 text-muted hover:text-crimson" aria-label="Remove portrait" title="Remove portrait">
            <Icon name="trash-2" size={14} />
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => input.current?.click()} className="flex h-8 w-8 items-center justify-center border border-cyan/50 bg-bg-0/85 text-cyan hover:bg-cyan/15" aria-label="Upload portrait" title="Upload portrait (or drop an image here)">
          <Icon name={pending ? "loader-circle" : "camera"} size={14} className={pending ? "animate-spin" : undefined} />
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" data-testid="portrait-input" onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}
