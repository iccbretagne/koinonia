"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { getTourSteps, type TourStep, type RoleKey } from "@/lib/tour-steps";

interface GuidedTourProps {
  userRole: RoleKey;
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
  steps: TourStep[];
  onFinish: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null);

  const step = steps[currentStep];
  const isCentered = step?.target === "center";
  const isLast = currentStep === steps.length - 1;

  // Find and measure target element
  useEffect(() => {
    if (!step || isCentered) {
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
          fill="rgba(0,0,0,0.5)"
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
            boxShadow: "0 0 0 3px #5E17EB",
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
  HTMLDivElement,
  {
    step: TourStep;
    stepIndex: number;
    totalSteps: number;
    isLast: boolean;
    onNext: () => void;
    onBack: () => void;
    onSkip: () => void;
  }
>(function TooltipCard({ step, stepIndex, totalSteps, isLast, onNext, onBack, onSkip }, ref) {
  return (
    <div
      ref={ref}
      style={{
        background: "white",
        borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        fontFamily: "Montserrat, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#1f2937" }}>
            {step.title}
          </h3>
          <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
            {stepIndex + 1}/{totalSteps}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "8px 20px 16px" }}>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#4b5563", lineHeight: 1.5 }}>
          {step.content}
        </p>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          borderTop: "1px solid #f3f4f6",
          gap: 8,
        }}
      >
        <button
          onClick={onSkip}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "0.875rem",
            color: "#9ca3af",
            fontFamily: "inherit",
            padding: "6px 0",
          }}
        >
          Passer
        </button>

        <div style={{ display: "flex", gap: 8 }}>
          {stepIndex > 0 && (
            <button
              onClick={onBack}
              style={{
                background: "white",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: "0.875rem",
                color: "#374151",
                fontFamily: "inherit",
                padding: "6px 16px",
              }}
            >
              Retour
            </button>
          )}
          <button
            onClick={onNext}
            style={{
              background: "#5E17EB",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: "0.875rem",
              color: "white",
              fontFamily: "inherit",
              fontWeight: 500,
              padding: "6px 16px",
            }}
          >
            {isLast ? "Terminer" : "Suivant"}
          </button>
        </div>
      </div>
    </div>
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
