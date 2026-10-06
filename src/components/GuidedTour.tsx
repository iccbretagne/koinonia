"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { getTourSteps, type TourStep, type RoleKey } from "@/lib/tour-steps";
import Button from "@/components/ui/Button";

interface GuidedTourProps {
  readonly userRole: RoleKey;
}

interface TooltipPosition {
  top: number;
  left: number;
  placement: "top" | "bottom" | "left" | "right";
}

function getTooltipPosition(rect: DOMRect, tooltipW: number, tooltipH: number): TooltipPosition {
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;
  const vw = window.innerWidth;
  const gap = 12;

  // Prefer bottom
  if (rect.bottom + gap + tooltipH < window.innerHeight + scrollY) {
    return {
      top: rect.bottom + scrollY + gap,
      left: Math.max(8, Math.min(rect.left + scrollX + rect.width / 2 - tooltipW / 2, vw - tooltipW - 8)),
      placement: "bottom",
    };
  }

  // Try top
  if (rect.top + scrollY - gap - tooltipH > 0) {
    return {
      top: rect.top + scrollY - gap - tooltipH,
      left: Math.max(8, Math.min(rect.left + scrollX + rect.width / 2 - tooltipW / 2, vw - tooltipW - 8)),
      placement: "top",
    };
  }

  // Fallback: below
  return {
    top: rect.bottom + scrollY + gap,
    left: Math.max(8, Math.min(rect.left + scrollX + rect.width / 2 - tooltipW / 2, vw - tooltipW - 8)),
    placement: "bottom",
  };
}

function TourOverlay({
  steps,
  onFinish,
}: {
  readonly steps: TourStep[];
  readonly onFinish: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDialogElement>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null);

  const step = steps[currentStep];
  const isCentered = step?.target === "center";
  const isLast = currentStep === steps.length - 1;

  // Find and measure target element
  useEffect(() => {
    if (!step || isCentered) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(step.target);
    if (!el) {
      // Target not found — skip this step
      if (currentStep < steps.length - 1) {
        setCurrentStep((s) => s + 1);
      } else {
        onFinish();
      }
      return;
    }

    // Scroll element into view
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    };

    // Measure after scroll settles
    const timer = setTimeout(measure, 350);
    return () => clearTimeout(timer);
  }, [step, isCentered, currentStep, steps.length, onFinish]);

  // Position tooltip
  useEffect(() => {
    if (isCentered || !targetRect || !tooltipRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTooltipPos(null);
      return;
    }

    const tooltipEl = tooltipRef.current;
    const pos = getTooltipPosition(targetRect, tooltipEl.offsetWidth, tooltipEl.offsetHeight);
    setTooltipPos(pos);
  }, [targetRect, isCentered, currentStep]);

  const handleNext = useCallback(() => {
    if (isLast) {
      onFinish();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }, [isLast, onFinish]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  if (!step) return null;

  const padding = 8;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
      {/* Overlay */}
      <svg
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && !isCentered && (
              <rect
                x={targetRect.left - padding}
                y={targetRect.top - padding}
                width={targetRect.width + padding * 2}
                height={targetRect.height + padding * 2}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="var(--scrim)"
          mask="url(#tour-mask)"
          style={{ pointerEvents: "auto" }}
          onClick={(e) => e.stopPropagation()}
        />
      </svg>

      {/* Spotlight ring */}
      {targetRect && !isCentered && (
        <div
          style={{
            position: "fixed",
            top: targetRect.top - padding,
            left: targetRect.left - padding,
            width: targetRect.width + padding * 2,
            height: targetRect.height + padding * 2,
            borderRadius: 8,
            boxShadow: "0 0 0 3px var(--brand)",
            pointerEvents: "none",
            transition: "all 0.3s ease",
          }}
        />
      )}

      {/* Tooltip */}
      {isCentered ? (
        // Centered modal
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            maxWidth: 400,
            width: "calc(100% - 32px)",
          }}
        >
          <TooltipCard
            ref={tooltipRef}
            step={step}
            stepIndex={currentStep}
            totalSteps={steps.length}
            isLast={isLast}
            onNext={handleNext}
            onBack={handleBack}
            onSkip={onFinish}
          />
        </div>
      ) : tooltipPos ? (
        <div
          style={{
            position: "absolute",
            top: tooltipPos.top,
            left: tooltipPos.left,
            maxWidth: 360,
            width: "calc(100% - 16px)",
            transition: "top 0.3s ease, left 0.3s ease",
          }}
        >
          <TooltipCard
            ref={tooltipRef}
            step={step}
            stepIndex={currentStep}
            totalSteps={steps.length}
            isLast={isLast}
            onNext={handleNext}
            onBack={handleBack}
            onSkip={onFinish}
          />
        </div>
      ) : (
        // Hidden tooltip for measurement
        <div
          style={{
            position: "absolute",
            top: -9999,
            left: -9999,
            maxWidth: 360,
            width: "calc(100% - 16px)",
            visibility: "hidden",
          }}
        >
          <TooltipCard
            ref={tooltipRef}
            step={step}
            stepIndex={currentStep}
            totalSteps={steps.length}
            isLast={isLast}
            onNext={handleNext}
            onBack={handleBack}
            onSkip={onFinish}
          />
        </div>
      )}
    </div>,
    document.body
  );
}

import { forwardRef } from "react";

const TooltipCard = forwardRef<
  HTMLDialogElement,
  {
    readonly step: TourStep;
    readonly stepIndex: number;
    readonly totalSteps: number;
    readonly isLast: boolean;
    readonly onNext: () => void;
    readonly onBack: () => void;
    readonly onSkip: () => void;
  }
>(function TooltipCard({ step, stepIndex, totalSteps, isLast, onNext, onBack, onSkip }, ref) {
  return (
    <dialog open ref={ref} className="static m-0 block h-auto max-h-none w-full max-w-none p-0 overflow-hidden rounded-card border border-line bg-surface text-ink shadow-overlay" aria-label={step.title}>
      <div className="px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold leading-6 text-ink">{step.title}</h3>
          <span className="shrink-0 text-xs tabular-nums text-ink-subtle">
            {stepIndex + 1}/{totalSteps}
          </span>
        </div>
      </div>

      <div className="px-5 pb-4 pt-2">
        <p className="text-[15px] leading-[22px] text-ink-muted">{step.content}</p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Passer
        </Button>
        <div className="flex gap-2">
          {stepIndex > 0 && (
            <Button variant="secondary" size="sm" onClick={onBack}>
              Retour
            </Button>
          )}
          <Button size="sm" onClick={onNext}>
            {isLast ? "Terminer" : "Suivant"}
          </Button>
        </div>
      </div>
    </dialog>
  );
});

function GuidedTourInner({ userRole }: GuidedTourProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(window.innerWidth < 768);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || finishedRef.current) return;
    if (searchParams.get("tour") === "1") {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, [searchParams, mounted]);

  const handleFinish = useCallback(() => {
    finishedRef.current = true;
    setActive(false);
    // Mark tour as seen (fire-and-forget)
    fetch("/api/user/tour-seen", { method: "PATCH" }).catch(() => {});
    // Remove ?tour from URL
    const url = new URL(window.location.href);
    url.searchParams.delete("tour");
    const path = url.pathname + (url.search || "");
    router.replace(path, { scroll: false });
  }, [router]);

  const steps = getTourSteps(userRole, isMobile);

  if (!active || steps.length === 0) return null;

  return <TourOverlay steps={steps} onFinish={handleFinish} />;
}

export default function GuidedTour({ userRole }: GuidedTourProps) {
  return (
    <Suspense fallback={null}>
      <GuidedTourInner userRole={userRole} />
    </Suspense>
  );
}
