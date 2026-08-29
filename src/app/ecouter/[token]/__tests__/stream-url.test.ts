import { describe, it, expect } from "vitest";
import { buildStreamUrl } from "../stream-url";
import type { AudioPlayerSegment } from "@/components/audio/AudioPlayer";

function segment(overrides: Partial<AudioPlayerSegment> = {}): AudioPlayerSegment {
  return { id: "seg-1", title: "Louange", order: 0, durationMs: 60000, version: "v1", ...overrides };
}

describe("buildStreamUrl (lien de partage public)", () => {
  it("change quand la version change (spec 026 : correction visible sans vider le cache)", () => {
    const before = buildStreamUrl("token-1", segment({ version: "v1" }));
    const after = buildStreamUrl("token-1", segment({ version: "v2" }));

    expect(before).not.toBe(after);
  });

  it("reste identique à version constante (pas de retéléchargement inutile)", () => {
    const a = buildStreamUrl("token-1", segment({ version: "v1" }));
    const b = buildStreamUrl("token-1", segment({ version: "v1" }));

    expect(a).toBe(b);
  });

  it("porte le segmentId et la version en paramètre de requête", () => {
    expect(buildStreamUrl("token-1", segment({ id: "seg-9", version: "abc123" }))).toBe(
      "/api/audio/public/token-1/stream/seg-9?v=abc123"
    );
  });
});
