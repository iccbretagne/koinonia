"use client";

import { useState } from "react";
import SpaceHome from "@/components/SpaceHome";
import Button from "@/components/ui/Button";
import SharesDrawer from "./SharesDrawer";
import type { SpaceCard } from "@/lib/media-space";

export default function MediaHomeClient({
  cards,
  showShareButton,
  shareCount,
}: {
  cards: SpaceCard[];
  showShareButton: boolean;
  shareCount: number;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <SpaceHome
        title="Communication & Production"
        cards={cards}
        headerAction={
          showShareButton ? (
            <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(true)}>
              Partages ({shareCount} lien{shareCount !== 1 ? "s" : ""} actif{shareCount !== 1 ? "s" : ""})
            </Button>
          ) : undefined
        }
      />
      <SharesDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
