import { useState, useCallback } from "react";

// Pure step-navigation state — deliberately knows nothing about form
// fields or validation itself. Each step's own component decides whether
// it's valid to advance (by calling `next()` only when its own fields
// check out) and can pass back a validation error via `blockAdvance` if
// it isn't ready — keeping per-step validation logic where it belongs,
// next to the fields it's validating, rather than centralized here where
// it'd have to know about every step's shape.
export function useWizardSteps(stepCount, { onStepChange } = {}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [furthestReached, setFurthestReached] = useState(0);

  const goTo = useCallback(
    (index) => {
      const clamped = Math.max(0, Math.min(stepCount - 1, index));
      setCurrentIndex(clamped);
      onStepChange?.(clamped);
    },
    [stepCount, onStepChange]
  );

  const next = useCallback(() => {
    setCurrentIndex((i) => {
      const nextIndex = Math.min(stepCount - 1, i + 1);
      setFurthestReached((f) => Math.max(f, nextIndex));
      onStepChange?.(nextIndex);
      return nextIndex;
    });
  }, [stepCount, onStepChange]);

  const back = useCallback(() => {
    setCurrentIndex((i) => {
      const prevIndex = Math.max(0, i - 1);
      onStepChange?.(prevIndex);
      return prevIndex;
    });
  }, [onStepChange]);

  return {
    currentIndex,
    isFirst: currentIndex === 0,
    isLast: currentIndex === stepCount - 1,
    furthestReached,
    goTo, // only meant to be called with an index <= furthestReached from the UI (WizardStepper enforces this)
    next,
    back,
  };
}
